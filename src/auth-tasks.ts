import {readFile} from 'fs/promises'
import {google} from 'googleapis'

export async function getGMailAuth(source: string, account: string) {
  try {
    return getAuth(
      source,
      [
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send'
      ],
      account
    )
  } catch (error) {
    throw `getGMailAuth(): Error reading GMail auth keys: ${error}`
  }
}

export async function getGDriveAuth(source: string) {
  try {
    return getAuth(source, ['https://www.googleapis.com/auth/drive'])
  } catch (error) {
    throw `getGDriveAuth(): Error reading Google Drive auth keys: ${error}`
  }
}

async function getAuth(source: string, scopes: string[], impersonate?: string) {
  let credentials: any

  try {
    // Assume "source" to be JSON
    credentials = JSON.parse(source)
  } catch (err) {
    // Not JSON; attempt to read as file on file-system
    try {
      credentials = await readJsonFile(source)
    } catch (err) {
      // Do not expose file name in log!
      throw 'Unable to parse or read the provided Google Drive credentials'
    }
  }
  return new google.auth.JWT(
    credentials.client_email,
    undefined,
    credentials.private_key,
    scopes,
    impersonate
  )
}

async function readJsonFile(path: string) {
  const file = await readFile(path, 'utf8')
  return JSON.parse(file)
}
