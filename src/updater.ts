import nodePath from 'path'
import {fileMatcher} from './file-match'

import {gitAction, gitFile, getGitFileList} from './git-tasks'

import {
  driveContext,
  driveFile,
  getDriveList,
  createDriveFolder,
  createDriveFile,
  updateDriveFile,
  deleteDriveFile,
  deleteDriveFolder
} from './drive-tasks'

import {getGDriveAuth, getGMailAuth} from './auth-tasks'
import {mail, sendMail} from './mail-tasks'
import {slackConfig, slackNotifier} from './slack-tasks'
import {logger} from './logger'
import {RateController} from './rate-controller'
import {error} from 'console'

const appName = 'Github2Drive'

enum actionType {
  create,
  update,
  delete
}

interface action {
  type: actionType
  gitFile?: gitFile
  driveFile?: driveFile
}

export async function run() {
  try {
    if (!process.env.GOOGLE_KEY) throw '$GOOGLE_KEY is empty'
    if (!process.env.GDRIVE_FOLDERID) throw '$GDRIVE_FOLDERID is empty'
    if (!process.env.GIT_ORIGIN) throw '$GIT_ORIGIN is empty'

    const dryRun = process.env.DRY_RUN == 'true'

    // Do not expose credentials!
    // logger.debug(`GOOGLE_KEY: [${process.env.GOOGLE_KEY}]`)
    logger.debug(`GDRIVE_FOLDERID: [${process.env.GDRIVE_FOLDERID}]`)
    logger.debug(`GIT_ROOT: [${process.env.GIT_ROOT ?? ''}]`)
    logger.debug(`GIT_SUBDIR: [${process.env.GIT_SUBDIR ?? ''}]`)
    logger.debug(`GIT_ORIGIN: [${process.env.GIT_ORIGIN}]`)
    logger.debug(`GIT_GLOB: [${process.env.GIT_GLOB}]`)
    // Do not expose credentials!
    // logger.debug(`SLACK_TOKEN: [${process.env.SLACK_TOKEN}]`)
    logger.debug(`SLACK_CHANNELS: [${process.env.SLACK_CHANNELS}]`)
    logger.debug(`DRY_RUN: [${dryRun ? 'true' : 'false or not set'}]`)

    // Not supported yet
    // logger.debug(`MAIL_ACCOUNT: [${process.env.MAIL_ACCOUNT ?? ''}]`)
    // logger.debug(`MAIL_PREFIX: [${process.env.MAIL_PREFIX ?? ''}]`)
    // logger.debug(`MAIL_ERRORTO: [${process.env.MAIL_ERRORTO ?? ''}]`)
    // logger.debug(`MAIL_DEBUGTO: [${process.env.MAIL_DEBUGTO ?? ''}]`)

    const matcher = new fileMatcher(process.env.GIT_GLOB)

    if (process.env.MAIL_ACCOUNT)
      throw 'Sending mail is not supported yet, sorry.'

    logger.debug('Connecting to Google Drive.')
    const driveAuth = await getGDriveAuth(process.env.GOOGLE_KEY)
    await driveAuth.authorize()

    const mailAuth =
      process.env.MAIL_ACCOUNT == ''
        ? undefined
        : await getGMailAuth(process.env.GOOGLE_KEY, process.env.MAIL_ACCOUNT!)
    if (mailAuth) {
      logger.debug('Connecting to GMail.')
      await mailAuth.authorize()
    }

    const slackcfg = new slackConfig(
      process.env.SLACK_TOKEN,
      process.env.SLACK_CHANNELS
    )

    try {
      logger.debug('Building GIT file list.')

      // Error e-mails can be sent inside this try/catch
      const driveCtx = new driveContext(
        process.env.GDRIVE_FOLDERID,
        driveAuth,
        dryRun
      )

      const gitFiles = await getGitFileList(
        process.env.GIT_ROOT,
        process.env.GIT_ORIGIN,
        matcher,
        process.env.GIT_SUBDIR
      )

      logger.debug('Building Google Drive file list.')

      await getDriveList(driveCtx)

      logger.debug('Computing actions to perform.')

      const actions = getRequiredActions(gitFiles, driveCtx)

      if (actions.length) {
        logger.debug('Executing required actions.')

        // Max 20 updates at the same time
        const rc = new RateController(20)
        const tasks = []
        const notifier = new slackNotifier(slackcfg)

        // finished will grow until equal to actions.length
        let finished = 0

        for (const action of actions) {
          tasks.push(
            rc.fire('', async () => {
              try {
                await executeAction(notifier, action, gitFiles, driveCtx)
              } catch (err) {
                logger.error(`executeAction error: ${error}`)
              }
              finished += 1
            })
          )
        }

        // notified will grow until equal to finished
        let notified = 0

        while (notified < actions.length) {
          // Make sure to not call Slack faster than twice a second
          await new Promise<void>(done => setTimeout(() => done(), 500))
          if (notified == finished) continue
          // Sync notified with finished
          notified = finished
          // Now call slack
          notifier.notify(slackcfg)
        }

        await Promise.allSettled(tasks)
      } else {
        logger.debug('No actions required.')
      }
    } catch (error: any) {
      // Add the error to the log trail first
      logger.error(`Error: ${error}`)

      // Note: mail features currently not working due to GMail limitations
      if (mailAuth && (process.env.MAIL_ERRORTO || process.env.MAIL_DEBUGTO)) {
        const msg = `The following errors were found:\n\n$error\n\nLog trail is:\n\n${logger.logTrail()}`
        const data: mail = {
          to: process.env.MAIL_ERRORTO,
          cc: process.env.MAIL_DEBUGTO,
          subject: `${process.env.MAIL_PREFIX}Error caught while processing a Google Drive update`,
          text: msg
        }
        sendMail(data, mailAuth)
      }
      // TODO: signal Github that this action failed using @actions/core
      process.exitCode = 1 // ExitCode.Failure
      return
    }

    logger.debug(`Process completed.`)

    // Note: mail features currently not working due to GMail limitations
    if (mailAuth && process.env.MAIL_DEBUGTO) {
      const msg = `The process log is:\n\n${logger.logTrail()}`
      const data: mail = {
        to: process.env.MAIL_DEBUGTO,
        subject: `${process.env.MAIL_PREFIX}Finished processing a Google Drive update`,
        text: msg
      }
      await sendMail(data, mailAuth)
    }

    process.exitCode = 0 // ExitCode.Success
  } catch (error: any) {
    // TODO: signal Github that this action failed using @actions/core
    process.exitCode = 1 // ExitCode.Failure
    logger.error(`Error: ${error}`)
  }
}

async function createFile(
  notifier: slackNotifier,
  gf: gitFile,
  driveCtx: driveContext
) {
  const parent = nodePath.dirname(gf.relPath)
  try {
    const folder = await createDriveFolder(parent, driveCtx)
    // Convert the posix git-relative path to a local (windows/posix) path
    const realPath = nodePath.join(
      process.env.GIT_ROOT ?? '',
      gf.fullPath.split(nodePath.posix.sep).join(nodePath.sep)
    )
    const description = `Created by ${appName} upon hash ${gf.lastHash}`
    const df = await createDriveFile(
      realPath,
      description,
      {gitHash: gf.lastHash},
      folder,
      driveCtx
    )
    logger.debug(`Created file on drive: [${df.fullPath}]`)
    notifier.add(
      `*[ADDED]* <${df.webViewLink}|${df.name}> to \`${df.folder.fullPath}\``
    )
  } catch (error) {
    logger.error(
      `createFile(): unable to create file in drive:\n    ${parent}/${gf.name}\n    ${error}`
    )
  }
}

async function updateFile(
  notifier: slackNotifier,
  df: driveFile,
  gf: gitFile,
  driveCtx: driveContext
) {
  try {
    // The file already exists on GDrive; we just need to upload it again
    // Convert the posix git-relative path to a local (windows/posix) path
    const realPath = nodePath.join(
      process.env.GIT_ROOT ?? '',
      gf.fullPath.split(nodePath.posix.sep).join(nodePath.sep)
    )
    df.description = `Updated by ${appName} upon hash ${gf.lastHash}`
    df.properties = df.properties ?? {}
    df.properties.gitHash = gf.lastHash
    await updateDriveFile(realPath, df, driveCtx)
    logger.debug(`Updated file on drive: [${df.fullPath}]`)
    notifier.add(
      `*[MODIFIED]* <${df.webViewLink}|${df.name}> at \`${df.folder.fullPath}\``
    )
  } catch (error) {
    logger.error(
      `updateFile(): unable to update file in drive:\n    ${df.fullPath}\n    ${error}`
    )
  }
}

async function deleteFile(
  notifier: slackNotifier,
  gf: gitFile | undefined,
  df: driveFile,
  gitFiles: gitFile[],
  driveCtx: driveContext
) {
  try {
    df.properties = df.properties ?? {}
    df.properties.gitHash = gf?.lastHash ?? 'no-hash'
    df.description = `Deleted by ${appName} upon hash ${df.properties.gitHash}`
    const folder = df.folder
    await deleteDriveFile(df, driveCtx)
    logger.debug(`Deleted file on drive: [${df.fullPath}]`)
    notifier.add(`*[REMOVED]* _${df.name}_ from \`${df.folder.fullPath}\``)
    // Remove file from GIT collection
    if (gf) gitFiles.splice(gitFiles.indexOf(gf), 1)
    // If folder gets empty, delete the folder as well
    if (
      folder.files.length == 0 &&
      gitFiles.findIndex(f => f.folderPath == folder.fullPath) < 0
    ) {
      await deleteDriveFolder(folder, driveCtx)
      logger.debug(`Deleted folder on drive: [${folder.fullPath}]`)
    }
  } catch (error) {
    logger.error(
      `updateFile(): unable to delete file in drive:\n    ${df.fullPath}\n    ${error}`
    )
  }
}

function getRequiredActions(
  gitFiles: gitFile[],
  driveCtx: driveContext
): action[] {
  const actions: action[] = []

  // Check for deleted or non-existing files
  // These actions must be returned before the additions;
  // otherwise we might be deleting a file that has only changed
  driveCtx.files.forEach(df => {
    const gf = gitFiles.find(gf => gf.relPath == df.fullPath)
    // Only process files that should not be here
    if ((gf?.lastAction ?? gitAction.D) != gitAction.D) return
    actions.push({type: actionType.delete, gitFile: gf, driveFile: df})
    logger.debug(
      `File deleted [${df.properties?.gitHash ?? 'no hash info'}]=>[${
        gf?.lastAction ?? 'not-found'
      }:${gf?.lastHash ?? 'no hash'}]: [${df.fullPath}]`
    )
  })

  // Check for new or modified files
  gitFiles
    .filter(gf => gf.lastAction != gitAction.D)
    .forEach(gf => {
      // Check if the file is in the Drive list, and has the same hash
      const df = driveCtx.files.find(df => df.fullPath == gf.relPath)
      if (df) {
        // Do not process files that are up-to-date
        if (df.properties?.gitHash == gf.lastHash) {
          logger.debug(
            `File up-to-date [${df.properties?.gitHash}]=>[${gf.lastAction}:${gf.lastHash}], skipping: [${gf.relPath}]`
          )
          return
        }
        actions.push({type: actionType.update, gitFile: gf, driveFile: df})
        logger.debug(
          `File changed [${df.properties?.gitHash ?? 'no hash info'}]=>[${
            gf.lastAction
          }:${gf.lastHash}]: [${gf.relPath}]`
        )
      } else {
        logger.debug(
          `File created []=>[${gf.lastAction}:${gf.lastHash}]: [${gf.relPath}]`
        )
        actions.push({type: actionType.create, gitFile: gf})
      }
    })

  return actions
}

async function executeAction(
  notifier: slackNotifier,
  action: action,
  gitFiles: gitFile[],
  driveCtx: driveContext
) {
  switch (action.type) {
    case actionType.create:
      await createFile(notifier, action.gitFile!, driveCtx)
      break
    case actionType.update:
      await updateFile(notifier, action.driveFile!, action.gitFile!, driveCtx)
      break
    case actionType.delete:
      await deleteFile(
        notifier,
        action.gitFile!,
        action.driveFile!,
        gitFiles,
        driveCtx
      )
      break
  }
}
