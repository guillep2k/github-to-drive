import axios from 'axios'

import {logger} from './logger'

// RegExp to match a Slack channel ID (xxxxxxxxx/yyyyyyyyyyy/zzzzzzzzzzzzzzzzzzzzzzzz)
// Strings matching slackUrlRegExp will be prepended with slackPfx.
const slackUrlRegExp =
  /^[A-Z0-9]{9,15}\/[A-Z0-9]{9,15}\/[0-9a-zA-Z_+/-]{18,32}$/
const slackPfx = 'https://hooks.slack.com/services/'

const maxAttemptCount = 5
const retryDelay = 3000 // 3 seconds between attempts
const slackTimeout = 60000 // 1 minute API call timeout

export class slackConfig {
  public readonly urls: string[]
  constructor(url: string | string[] = []) {
    const list = typeof url === 'string' ? url.split('|') : url
    this.urls = list
      .map(c => (slackUrlRegExp.test(c) ? slackPfx + c : c))
      .filter(c => c.toLowerCase().startsWith('https://'))
  }
}

export async function slackNotify(
  messages: string | string[],
  config: slackConfig
) {
  if (typeof messages === 'string') messages = [messages]
  for (const url of config.urls) {
    for (const m of messages) {
      try {
        await retryPostRequest(url, {text: m})
      } catch (error) {
        logger.error(`Slack API call error: ${error}`)
        // Do not abort the rest of the requests
      }
    }
  }
}

async function retryPostRequest(
  url: string,
  body: object,
  maxAttempts = maxAttemptCount
) {
  let attempt = 0
  for (;;) {
    try {
      // Axios' default behavior is to reject every response that returns with a
      // status code that falls out of the range of 2xx and treat it as an error.
      await axios.post(url, body, {
        timeout: slackTimeout,
        responseType: 'text' // The expected response is 'ok'
      })
      return
    } catch (error: any) {
      attempt++
      if (attempt >= maxAttempts) throw error
      logger.debug(`Slack API call error (retrying): ${error.toString()}`)
    }
    await new Promise(resolve => setTimeout(resolve, retryDelay))
  }
}
