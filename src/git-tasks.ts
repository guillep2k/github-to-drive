import {access} from 'fs/promises'
import {constants} from 'fs'
import nodePath from 'path'
import simpleGit from 'simple-git'

import {fileMatcher} from './file-match'

export enum gitAction {
  A = 'A',
  M = 'M',
  D = 'D'
}

export interface gitFile {
  name: string // CORSA-2022.pdf
  fullPath: string // samples/INSTALL GUIDES/OPEL/CORSA/CORSA-2022.pdf
  relPath: string // OPEL/CORSA/CORSA-2022.pdf    (e.g. for subdir = 'samples/INSTALL GUIDES')
  lastAction: gitAction // gitAction.M
  lastCommit: string // 5882e2ad360f098cd0350dc7dfb0e9c55648aec8
  folderPath: string // OPEL/CORSA
}

export async function getGitFileList(
  root: string | undefined,
  origin: string,
  matcher: fileMatcher,
  subdir = ''
): Promise<gitFile[]> {
  try {
    if (subdir.startsWith('/'))
      throw `GIT subdirectory (${subdir}) must not be an absolute path`
    // Support for '.' and './some-path'
    if (subdir == '.') subdir = ''
    if (subdir.startsWith('./')) subdir = subdir.substring(2)
    // Make sure subdir ends with '/' (unless it's empty) for faster pattern matching
    if (subdir != '' && !subdir.endsWith('/')) subdir = subdir + '/'
    const rawList: string = await simpleGit(root, {trimmed: true}).raw([
      '-c',
      'core.quotepath=',
      'log',
      '--pretty=oneline',
      '--name-status',
      '--no-renames',
      origin
    ])
    const lines = rawList.split('\n')
    /*
    Lines are expected to be formatted like:
  
  hash {blank} Text            : a commit
      [A|M|D] {tab} Path           : a file action
  
      $ git -c core.quotepath= log --pretty="oneline" --name-status --no-renames
      5882e2ad360f098cd0350dc7dfb0e9c55648aec8 (HEAD -> main, origin/main) GDrive interface
      M       environment.d.ts
      M       package.json
      D       package-lock.json
      cf5f011553705f3b2b69092f649a52c4d3956091 First running module/version
      A       environment.d.ts
      A       src/updater.ts
      M       package-lock.json
      M       package.json
    */

    const gitFiles: gitFile[] = []
    let commit = ''
    const commitExpr = /^[0-9a-f]{40}$/ // We expect sha1 commit ids to be exactly 40 hex digits
    const fileList: {[key: string]: boolean} = {}

    for (const line of lines) {
      if (line.substring(1, 2) != '\t') {
        // Commit id. Save it for next iteration
        commit = line.split(' ')[0]
        if (!commitExpr.exec(commit)) {
          throw `Parsing error in git output; commit hash ('${commit}') doesn't have the proper format: '${debugGitLine(
            line
          )}'`
        }
      } else {
        if (!commit)
          throw `Parsing error in git output; file in log not preceeded by a commit hash: '${debugGitLine(
            line
          )}'`
        // It's a file event
        const parts = line.split('\t', 3)
        if (parts.length > 2)
          throw `Unparseable git status string: ${debugGitLine(line)}`
        const fullPath = parts[1]
        // Ignore files not under subdir
        if (subdir && !fullPath.startsWith(subdir)) continue
        // Ignore files under '.github', like .github/workflows
        if (fullPath.split(nodePath.posix.sep)[0].toLowerCase() == '.github')
          continue
        // Ignore files already processed on newer commits (commits are ordered newest to oldest)
        if (fileList[fullPath]) continue
        const action = decodeAction(parts[0])
        if (!action)
          throw `Parsing error in git output; unexpected action type ('${
            parts[0]
          }'): ${debugGitLine(line)}'`
        // Make sure the file exists locally (unless it's a delete, then it shouldn't)
        const realPath = nodePath.join(
          root ?? '',
          fullPath.split(nodePath.posix.sep).join(nodePath.sep)
        )
        const relPath = fullPath.substring(subdir.length)
        // Ignore files that don't match the patterns
        if (!matcher.matches(relPath)) continue
        let exists: boolean
        await access(realPath, constants.R_OK)
          .then(() => (exists = true))
          .catch(() => (exists = false))
        if (action == gitAction.D) {
          if (exists!)
            throw `Parsing inconsistency in git output: file looks deleted, but exists locally: '${debugGitLine(
              line
            )}'`
        } else {
          if (!exists!)
            throw `Parsing inconsistency in git output: file looks created/modified, but doesn't exist locally: '${debugGitLine(
              line
            )}'`
        }
        const file: gitFile = {
          name: nodePath.posix.basename(fullPath),
          fullPath: fullPath,
          relPath: relPath,
          folderPath: nodePath.posix.dirname(relPath),
          lastAction: action,
          lastCommit: commit
        }
        gitFiles.push(file)
        fileList[fullPath] = true
      }
    }

    return gitFiles
  } catch (error) {
    throw `getGitFileList(): error processing file list:\n${error}`
  }
}

function debugGitLine(line: string): string {
  return '[' + line.replace('\t', '<TAB>') + ']'
}

// exported for testing only
export function decodeAction(name: string): gitAction | undefined {
  switch (name) {
    case 'A':
      return gitAction.A
    case 'M':
      return gitAction.M
    case 'D':
      return gitAction.D
    default:
      return undefined
  }
}
