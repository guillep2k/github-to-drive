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
  lastHash: string // 5882e2ad360f098cd0350dc7dfb0e9c55648aec8
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
      'ls-tree',
      '--full-tree',
      '--name-only',
      '-r',
      origin
    ])
    const lines = rawList.split('\n')
    /*
    Lines are expected to be file paths, relative to the git root
  
      $ git -c core.quotepath= ls-tree --full-tree --name-only -r origin/main
      environment.d.ts
      src/updater.ts
      package-lock.json
      package.json
      [...]
    */

    const gitFiles: gitFile[] = []
    const fileList: {[key: string]: boolean} = {}
    const hashMatch = /^[0-9a-z]{40}$/

    for (const fullPath of lines) {
      // Ignore files not under subdir
      if (subdir && !fullPath.startsWith(subdir)) continue
      // Ignore files under '.github', like .github/workflows
      if (fullPath.split(nodePath.posix.sep)[0].toLowerCase() == '.github')
        continue
      // Make sure the file exists locally and get its hash
      const relPath = fullPath.substring(subdir.length)
      // Ignore files that don't match the patterns
      if (!matcher.matches('/' + relPath)) continue

      const fileHash: string = await simpleGit(root, {trimmed: true}).raw([
        '-c',
        'core.quotepath=',
        'hash-object',
        fullPath
      ])

      if (!hashMatch.exec(fileHash ?? '')) {
        throw `Parsing inconsistency in git output: file looks tracked by git, but doesn't exist locally (or can't get a hash from it): '${debugGitLine(
          fullPath
        )}'`
      }

      const file: gitFile = {
        name: nodePath.posix.basename(fullPath),
        fullPath: fullPath,
        relPath: relPath,
        folderPath: nodePath.posix.dirname(relPath),
        lastAction: gitAction.A,
        lastHash: fileHash // this value is used to track changes
      }
      gitFiles.push(file)
      fileList[fullPath] = true
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
