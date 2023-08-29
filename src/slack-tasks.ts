import {
  ChatPostMessageArguments,
  WebClient as slackClient
} from '@slack/web-api'
import {logger} from './logger'

const MAX_SLACK_MESSAGE = 30000 // It's 40,000 actually

export class slackNotifier {
  public readonly config: slackConfig
  private data: string[] = []
  constructor(config: slackConfig) {
    this.config = config
  }
  add(msg: string) {
    logger.notice(msg)
    this.data.push(msg)
  }
  async notify(slackcfg: slackConfig) {
    const batch = this.data
    this.data = []
    await slackNotify(batch, slackcfg)
  }
}

export class slackConfig {
  public readonly token?: string
  public readonly channels: string[]
  public client?: slackClient
  constructor(token: string | undefined, channels: string | string[] = []) {
    this.token = token
    this.channels =
      typeof channels === 'string' ? channels.split(',') : channels
    if (this.token && this.channels.length) {
      this.client = new slackClient(token, {
        retryConfig: {
          // We don't want this process to drag forever
          maxRetryTime: 120000,
          retries: 5,
          minTimeout: 1000,
          maxTimeout: 5000
        }
      })
    }
  }
}

export async function slackNotify(
  messages: string | string[],
  config: slackConfig
) {
  if (!config.client) return
  if (typeof messages === 'string') messages = [messages]
  messages = messages.filter(m => m != '')
  // Repeat until all messages are sent
  while (messages.length) {
    // Chunk messages in blocks of up to MAX_SLACK_MESSAGE chars
    const current: string[] = []
    let messageLength = 0
    for (;;) {
      messageLength += messages[0].length
      current.push(messages.shift()!)
      if (
        messages.length == 0 ||
        messageLength + messages[0].length + 1 >= MAX_SLACK_MESSAGE
      )
        break
    }
    for (const channel of config.channels) {
      try {
        const args: ChatPostMessageArguments = {
          text: current.join('\n'),
          channel: channel,
          unfurl_links: false,
          unfurl_media: false
        }
        await config.client.chat.postMessage(args)
      } catch (error) {
        logger.error(`Slack API call (#${channel}) error: ${error}`)
        // Do not abort the rest of the requests
      }
    }
  }
}
