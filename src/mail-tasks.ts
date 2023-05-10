import {gmail_v1, google} from 'googleapis'

import MailComposer from 'nodemailer/lib/mail-composer'

export type mail = {
  to?: string | string[]
  cc?: string | string[]
  subject?: string
  text?: string
  html?: string
}

function getGmailService(auth: any): gmail_v1.Gmail {
  return google.gmail({version: 'v1', auth: auth})
}

function encodeMessage(message: Buffer): string {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function createMail(options: any): Promise<string> {
  const mailComposer = new MailComposer(options)
  const message = await mailComposer.compile().build()
  return encodeMessage(message)
}

export async function sendMail(
  data: mail,
  auth: any
): Promise<string | null | undefined> {
  try {
    const options = {
      to: data.to,
      cc: data.cc,
      subject: data.subject,
      text: data.text,
      html: data.html,
      textEncoding: 'base64'
    }
    const gmail = getGmailService(auth)
    const rawMessage = await createMail(options)
    const {data: {id} = {}} = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage
      }
    })
    return id
  } catch (error) {
    console.error(`Error sending emails:\n${error}`)
    // Do not bubble up the execption!
    return null
  }
}
