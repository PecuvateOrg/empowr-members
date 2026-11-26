// @pecuvate-email v1
// Canonical copy: ~/projects/_config/skills/ses-email/templates/send-email.ts
// DO NOT EDIT a site's copy. Change the canonical file, bump the version line, re-copy (/ses-email).
// A daily check (agent-os/checks/75-ses.sh) flags any copy that differs from the canonical.
//
// One send function for every group site. Same call and result shape as Resend's `emails.send`
// ({ data: { id } | null, error }), never throws, so migrating a site is an import swap.
//
// Env:
//   EMAIL_PROVIDER         ses (default) | resend   — rollback is a config flip, no deploy of code
//   SES_BRAND              empowr | pecuvate        — picks configuration set <brand>-<stream>
//   SES_REGION             default eu-west-2
//   SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY  per-site IAM user (send-only). Unset → default AWS
//                          credential chain (Lambda role, local SSO). Never AWS_* names: Amplify
//                          rejects them and Netlify reserves them.
//   RESEND_API_KEY         only while EMAIL_PROVIDER=resend
//
// Needs: @aws-sdk/client-sesv2

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

export type EmailStream = 'auth' | 'transactional'

export interface EmailAttachment {
  filename: string
  /** Buffer, or a base64 string */
  content: Buffer | string
  contentType?: string
}

export interface EmailMessage {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string | string[]
  attachments?: EmailAttachment[]
  /** Resend-style tags; sent to SES as message tags (visible in /ses/events). */
  tags?: { name: string; value: string }[]
  /** 'auth' for sign-in codes, OTPs and resets; everything else 'transactional' (default). */
  stream?: EmailStream
  /** Honoured by Resend; SES has no idempotency, so callers must not rely on it for de-duplication. */
  idempotencyKey?: string
}

export interface EmailResult {
  data: { id: string } | null
  error: { name: string; message: string } | null
}

const list = (v?: string | string[]) => (v == null ? [] : Array.isArray(v) ? v : [v])
const b64 = (c: Buffer | string) => (typeof c === 'string' ? c : c.toString('base64'))
const tagSafe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) || '_'
const fail = (name: string, e: unknown): EmailResult => ({
  data: null,
  error: { name, message: e instanceof Error ? e.message : String(e) },
})

let client: SESv2Client | undefined
function ses(): SESv2Client {
  if (!client) {
    const id = process.env.SES_ACCESS_KEY_ID
    const secret = process.env.SES_SECRET_ACCESS_KEY
    client = new SESv2Client({
      region: process.env.SES_REGION || 'eu-west-2',
      ...(id && secret ? { credentials: { accessKeyId: id, secretAccessKey: secret } } : {}),
    })
  }
  return client
}

function configurationSet(stream: EmailStream = 'transactional'): string | undefined {
  const brand = process.env.SES_BRAND
  return brand ? `${brand}-${stream}` : undefined
}

// Minimal MIME for messages with attachments (SES Raw content).
function rawMime(m: EmailMessage): Uint8Array {
  const b = `=_pe_${Math.random().toString(36).slice(2)}`
  const alt = `${b}_alt`
  const enc = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n')
  const hdr = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`)
  const lines = [
    `From: ${m.from}`,
    `To: ${list(m.to).join(', ')}`,
    ...(m.cc ? [`Cc: ${list(m.cc).join(', ')}`] : []),
    ...(m.replyTo ? [`Reply-To: ${list(m.replyTo).join(', ')}`] : []),
    `Subject: ${hdr(m.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
  ]
  if (m.text) lines.push(`--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', enc(m.text))
  if (m.html) lines.push(`--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', enc(m.html))
  lines.push(`--${alt}--`)
  for (const a of m.attachments ?? []) {
    const name = hdr(a.filename).replace(/"/g, '')
    lines.push(
      `--${b}`,
      `Content-Type: ${a.contentType || 'application/octet-stream'}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      b64(a.content).replace(/.{76}/g, '$&\r\n'),
    )
  }
  lines.push(`--${b}--`, '')
  return Buffer.from(lines.join('\r\n'), 'utf8')
}

async function sendSes(m: EmailMessage): Promise<EmailResult> {
  const tags = [...(m.tags ?? []), ...(m.stream ? [{ name: 'stream', value: m.stream }] : [])].map((t) => ({
    Name: tagSafe(t.name),
    Value: tagSafe(t.value),
  }))
  const Content = m.attachments?.length
    ? { Raw: { Data: rawMime(m) } }
    : {
        Simple: {
          Subject: { Data: m.subject, Charset: 'UTF-8' },
          Body: {
            ...(m.html ? { Html: { Data: m.html, Charset: 'UTF-8' } } : {}),
            ...(m.text ? { Text: { Data: m.text, Charset: 'UTF-8' } } : {}),
          },
        },
      }
  try {
    const out = await ses().send(
      new SendEmailCommand({
        FromEmailAddress: m.from,
        Destination: { ToAddresses: list(m.to), CcAddresses: list(m.cc), BccAddresses: list(m.bcc) },
        ReplyToAddresses: list(m.replyTo),
        Content,
        ConfigurationSetName: configurationSet(m.stream),
        EmailTags: tags.length ? tags : undefined,
      }),
    )
    return { data: { id: out.MessageId ?? '' }, error: null }
  } catch (e) {
    return fail((e as { name?: string })?.name || 'ses_error', e)
  }
}

async function sendResend(m: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return fail('missing_api_key', 'RESEND_API_KEY is not set (EMAIL_PROVIDER=resend)')
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(m.idempotencyKey ? { 'Idempotency-Key': m.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: m.from,
        to: list(m.to),
        subject: m.subject,
        html: m.html,
        text: m.text,
        cc: m.cc,
        bcc: m.bcc,
        reply_to: m.replyTo,
        tags: m.tags?.map((t) => ({ name: tagSafe(t.name), value: tagSafe(t.value) })),
        attachments: m.attachments?.map((a) => ({ filename: a.filename, content: b64(a.content) })),
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string }
    return res.ok && body.id
      ? { data: { id: body.id }, error: null }
      : fail(body.name || `http_${res.status}`, body.message || `Resend returned ${res.status}`)
  } catch (e) {
    return fail('network_error', e)
  }
}

// Plain-text part from HTML when the caller gives none. Resend adds one automatically; SES does not, and an
// HTML-only message scores worse with spam filters. Links are kept as "label (url)".
export function htmlToText(html: string): string {
  const ent: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", pound: '£', copy: '©', mdash: '—', ndash: '–', hellip: '…', middot: '·', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', euro: '€', trade: '™', reg: '®' }
  return html
    .replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, '').trim()
      return !l || l === href || href.startsWith('mailto:') ? l || href : `${l} (${href})`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|tr|h[1-6]|table|ul|ol|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ent[e] ?? (/^#x[0-9a-f]+$/i.test(e) ? String.fromCodePoint(parseInt(e.slice(2), 16)) : /^#\d+$/.test(e) ? String.fromCodePoint(Number(e.slice(1))) : m))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Send one email. Never throws; check `error`. */
export async function sendEmail(m: EmailMessage): Promise<EmailResult> {
  if (!m.html && !m.text) return fail('validation_error', 'html or text is required')
  if (!list(m.to).length) return fail('validation_error', 'to is required')
  const msg = m.html && !m.text ? { ...m, text: htmlToText(m.html) } : m
  return (process.env.EMAIL_PROVIDER || 'ses') === 'resend' ? sendResend(msg) : sendSes(msg)
}

/**
 * Send many emails, one result per input in input order. Never throws.
 * Paced under the SES account rate (14/s) by default; raise `perSecond` only if the quota is raised.
 */
export async function sendEmailBatch(messages: EmailMessage[], opts: { perSecond?: number } = {}): Promise<EmailResult[]> {
  const perSecond = Math.max(1, opts.perSecond ?? 10)
  const results: EmailResult[] = new Array(messages.length)
  for (let i = 0; i < messages.length; i += perSecond) {
    const started = Date.now()
    const slice = messages.slice(i, i + perSecond)
    const out = await Promise.all(slice.map(sendEmail))
    out.forEach((r, j) => (results[i + j] = r))
    const wait = 1000 - (Date.now() - started)
    if (i + perSecond < messages.length && wait > 0) await new Promise((r) => setTimeout(r, wait))
  }
  return results
}
