import nodePath from 'path'
import fs from 'fs'

import {drive_v3, google} from 'googleapis'

import {logger} from './logger'

const badLink = 'about:blank'

import {getFileList} from './drive-getfilelist'

export interface driveFolder {
  name: string // OPEL
  id: string // 1vGCF791lfVuN1IYa1CsAE7qr2YWbXi6S
  fullPath: string // INSTALL GUIDES/OPEL  (relative to, not including, provided root)
  idPath: string[] // ['1rVYAOLnBGxhOpTdIeKh9BHjmCd1l55Pw', '1vGCF791lfVuN1IYa1CsAE7qr2YWbXi6S']
  files: driveFile[] // List of files in this folder
}

export interface driveFile {
  name: string // OPEL
  fullPath: string // INSTALL GUIDES/OPEL
  id: string // 1rVYAOLnBGxhOpTdIeKh9BHjmCd1l55Pw
  webViewLink: string // https://drive.google.com/open?id=1oJA7NYzb4Vnb6iEZ-rUnIjz3hc85XROT
  folder: driveFolder // [driveFolder object]
  description?: string // Arbitrary text, visible by user
  properties?: {[key: string]: string} // Arbitrary list of properties (key/value pairs) in the file metadata
}

export class driveContext {
  public readonly files: driveFile[] = []
  public readonly folders: driveFolder[] = []
  public readonly auth: any
  public readonly root: string
  constructor(root: string, auth: any) {
    this.root = root
    this.auth = auth
  }
  getDrive(): drive_v3.Drive {
    return google.drive({version: 'v3', auth: this.auth})
  }
}

export async function getDriveList(ctx: driveContext): Promise<boolean> {
  try {
    const resource = {
      auth: ctx.auth,
      id: ctx.root,
      fields: 'files(name,description,properties,id,webViewLink,trashed)'
    }
    const res = await getDriveFileListAsync(resource)
    const fdt = res.folderTree
    const foldersById: {[key: string]: driveFolder} = {}

    for (let i = 0; i < fdt.id.length; i++) {
      const folder: driveFolder = {
        name: fdt.names[i],
        id: fdt.folders[i],
        idPath: fdt.id[i],
        fullPath: '', // TBD
        files: [] // TBD
      }
      ctx.folders.push(folder)
      foldersById[folder.id] = folder
    }

    ctx.folders.forEach(df => {
      // Fill in the names of the parents, **skipping the root**
      df.fullPath = df.idPath
        .slice(1)
        .map(pid => foldersById[pid].name)
        .join(nodePath.posix.sep)
      logger.debug(`Folder: '${df.fullPath}'`)
    })

    res.fileList.forEach((flist: any) => {
      const tree: string[] = flist.folderTree
      const folderId = tree.slice(-1)[0]
      const folder: driveFolder = foldersById[folderId]

      logger.debug(`Files in [${folder.fullPath}]:`)
      flist.files.forEach((file: any) => {
        // Ignore trashed files
        if (file.trashed) return
        const dfile: driveFile = {
          name: file.name,
          fullPath: nodePath.posix.join(folder.fullPath, file.name),
          id: file.id,
          webViewLink: file.webViewLink ?? badLink,
          folder: folder,
          description: file.description,
          properties: file.properties ?? {}
        }
        ctx.files.push(dfile)
        folder.files.push(dfile)
        logger.debug(`    File: '${dfile.fullPath}'`)
        logger.debug(`        Description:[${dfile.description}]`)
        logger.debug(`        Commit:[${dfile.properties?.commit}]`)
      })
    })

    return true
  } catch (error) {
    throw `getDriveList(): error retrieving Google Drive contents:\n${error}`
  }
}

export async function createDriveFolder(
  path: string,
  ctx: driveContext
): Promise<driveFolder> {
  if (path == '.') path = ''
  let folder = Object.entries(ctx.folders).find(
    ([, val]) => val.fullPath == path
  )?.[1]
  if (folder) return folder

  if (path == '') throw `createDriveFolder: unable to find root folder in drive`

  const parent = await createDriveFolder(nodePath.dirname(path), ctx)
  if (!parent)
    throw `createDriveFolder: unable to find parent folder for [${path}]`

  // Need to create the folder on Drive
  const name = nodePath.basename(path)
  const drive = ctx.getDrive()
  const params: drive_v3.Params$Resource$Files$Create = {
    fields: 'id',
    supportsAllDrives: true,
    requestBody: {
      mimeType: 'application/vnd.google-apps.folder',
      name: name,
      parents: [parent.id]
    }
  }

  // This will create the folder
  const res = await drive.files.create(params)
  if (!res?.data?.id) throw `Drive folder created but no ID returned: '${path}'`

  // Create and return the driveFolder object
  folder = {
    id: res.data.id,
    name: name,
    fullPath: path,
    idPath: parent.idPath.concat(res.data.id),
    files: []
  }
  ctx.folders.push(folder)
  return folder
}

export async function createDriveFile(
  localPath: string,
  description: string,
  properties: {[key: string]: string} | undefined,
  parent: driveFolder,
  ctx: driveContext
): Promise<driveFile> {
  // localPath is not necessarily Posix
  const name = nodePath.basename(localPath)
  const path = `${parent.fullPath}/${name}`

  // Need to create the folder on Drive
  const drive = ctx.getDrive()
  const params: drive_v3.Params$Resource$Files$Create = {
    fields: 'id,webViewLink',
    supportsAllDrives: true,
    requestBody: {
      name: name,
      properties: properties,
      description: description,
      parents: [parent.id]
    },
    media: {
      body: fs.createReadStream(localPath)
    }
  }

  // This will create the folder
  const res = await drive.files.create(params)
  if (!res?.data?.id) throw `Drive file created but no ID returned: '${path}'`

  // Create and return the driveFile object
  const file: driveFile = {
    id: res.data.id,
    name: name,
    webViewLink: res.data.webViewLink ?? badLink,
    fullPath: path,
    folder: parent,
    properties: properties
  }
  // Add file to collections
  parent.files.push(file)
  ctx.files.push(file)
  return file
}

// updateDriveFile: update the file contents or properties (metadata)
export async function updateDriveFile(
  localPath: string,
  file: driveFile,
  ctx: driveContext
): Promise<driveFile> {
  const drive = ctx.getDrive()
  const params: drive_v3.Params$Resource$Files$Update = {
    fileId: file.id,
    fields: 'id',
    supportsAllDrives: true,
    requestBody: {
      properties: file.properties,
      description: file.description
    },
    media: {
      body: fs.createReadStream(localPath)
    }
  }

  // This will create the folder
  const res = await drive.files.update(params)
  if (!res?.data?.id)
    throw `Drive file updated but no ID returned: '${file.folder.fullPath}/${file.name}'`

  return file
}

// deleteDriveFile: send a file to trash and update metadata (e.g. commit ID)
export async function deleteDriveFile(
  file: driveFile,
  ctx: driveContext
): Promise<boolean> {
  const drive = ctx.getDrive()
  const params: drive_v3.Params$Resource$Files$Update = {
    fileId: file.id,
    fields: 'id',
    supportsAllDrives: true,
    requestBody: {
      properties: file.properties,
      description: file.description,
      trashed: true
    }
  }

  // This will update/delete the file
  const res = await drive.files.update(params)
  if (!res?.data?.id)
    throw `Drive file updated but no ID returned: '${file.folder.fullPath}/${file.name}'`

  // Remove file from Drive collections
  file.folder.files.splice(file.folder.files.indexOf(file), 1)
  ctx.files.splice(ctx.files.indexOf(file), 1)

  return true
}

// deleteDriveFolder: send a folder to trash
export async function deleteDriveFolder(
  folder: driveFolder,
  ctx: driveContext
): Promise<boolean> {
  const drive = ctx.getDrive()
  const params: drive_v3.Params$Resource$Files$Update = {
    fileId: folder.id,
    fields: 'id',
    supportsAllDrives: true,
    requestBody: {
      trashed: true
    }
  }

  // This will update/delete the folder
  const res = await drive.files.update(params)
  if (!res?.data?.id)
    throw `Drive folder updated but no ID returned: '${folder.fullPath}'`

  // Remove folder from collections
  const i = ctx.folders.indexOf(folder)
  ctx.folders.splice(i, 1)

  return true
}

async function getDriveFileListAsync(resource: any): Promise<any> {
  // Make the function async-compatible
  return new Promise(function (resolve, reject) {
    getFileList(resource, function (err: any, res: any) {
      if (err) {
        reject(err)
      } else {
        resolve(res)
      }
    })
  })
}
