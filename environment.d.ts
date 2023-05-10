declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GOOGLE_KEY: string // File with the json key for the user
      GDRIVE_FOLDERID: string // Folder ID on Drive where the copy should take place
      GIT_ROOT: string | undefined // Folder on the local drive where the git repository copy is to be found
      GIT_SUBDIR: string | undefined // Sub-folder (relative) in the local drive to take the files from (e.g. samples/guides)
      GIT_ORIGIN: string // Name of the origin branch to take the history from (e.g. origin/main)
      MAIL_ACCOUNT: string | undefined // e-mail of the mail account to impersonate
      MAIL_PREFIX: string | undefined // Text prefix for the subject; e.g. "DriveUpdater: "
      MAIL_ERRORTO: string | undefined // Mail to send error logs to
      MAIL_DEBUGTO: string | undefined // Mail to send debug logs to
      SLACK_CHANNELS: string | undefined // List of Slack channels (separated by |) to post updates to
      NODE_ENV: 'development' | 'production'
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
