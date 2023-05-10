enum logType {
  debug = 'DEBUG',
  log = 'LOG',
  error = 'ERROR',
  notice = 'NOTICE' // Notices are not part of the log trail but meant for end-user communication (e.g. Slack)
}

class entry {
  public type: logType
  public message: string
  public date: Date
  constructor(type: logType, message: string) {
    this.type = type
    this.message = message
    this.date = new Date()
  }
  public toString = (): string => {
    return `${this.date.toISOString()} ${this.type}: ${this.message}`
  }
}

const logs = [] as entry[]
let notices = [] as entry[]

export class _logger {
  public debug(msg: string) {
    logs.push(new entry(logType.debug, msg))
    console.debug(msg)
  }
  public log(msg: string) {
    logs.push(new entry(logType.log, msg))
    console.log(msg)
  }
  public error(msg: string) {
    logs.push(new entry(logType.error, msg))
    console.error(msg)
  }
  public notice(msg: string) {
    notices.push(new entry(logType.notice, msg))
    console.log(msg)
  }
  // Notices do not include timestamp
  public notices(): string[] {
    return notices.map(e => e.message)
  }
  public errors(): string {
    return logs
      .filter(e => e.type == logType.error)
      .map(e => e.toString())
      .join('\n')
  }
  // logTrail() excludes notices
  public logTrail(): string {
    return logs.map(e => e.toString()).join('\n')
  }
  // Notices can be cleared
  public clearNotices() {
    notices = []
  }
}

export const logger = new _logger()
