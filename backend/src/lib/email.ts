// eClean — Email service (Resend)
// Dev mode: logs to console when RESEND_API_KEY is not set.

import { Resend } from 'resend'
import { env } from '../config/env'
import { logger } from './logger'

// Use verified Resend sender in dev/test; swap to branded domain once eclean.app is verified in Resend
const FROM = env.NODE_ENV === 'production'
  ? 'eClean <no-reply@eclean.app>'
  : 'eClean <onboarding@resend.dev>'

// Lazy singleton — only created once, only if key is present
let _client: Resend | null = null
function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null
  if (!_client) _client = new Resend(env.RESEND_API_KEY)
  return _client
}

// ─── Shared email shell ───────────────────────────────────────────────────────

function emailShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>eClean</title>
</head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0B0F1C 0%,#141C36 50%,#1E2A55 100%);padding:32px 32px 28px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:8px;">
              <div style="width:32px;height:32px;background:linear-gradient(135deg,#2952CC,#4F7FFF);border-radius:8px;display:inline-block;vertical-align:middle;"></div>
              <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;vertical-align:middle;">eClean</span>
            </div>
            <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:8px 0 0;letter-spacing:0.08em;text-transform:uppercase;">Keeping cities clean</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8F9FC;padding:20px 32px;border-top:1px solid #E8ECF4;text-align:center;">
            <p style="color:#9CA3AF;font-size:11px;margin:0;line-height:1.6;">
              You received this email because an action was taken on your eClean account.<br/>
              If you didn't request this, you can safely ignore this email.
            </p>
            <p style="color:#D1D5DB;font-size:10px;margin:8px 0 0;">© 2025 eClean · Bengaluru, India</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function primaryButton(label: string, url: string, color = '#2952CC'): string {
  return `<a href="${url}" style="display:inline-block;background:${color};color:#ffffff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:-0.2px;margin:8px 0;">${label}</a>`
}

// ─── sendVerificationEmail ────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url    = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`
  const client = getClient()

  if (!client) {
    console.log(`[DEV EMAIL] Verify email for ${to} → ${url}`)
    return
  }

  const html = emailShell(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;line-height:1;">✉️</div>
    </div>
    <h1 style="color:#0B0F1C;font-size:22px;font-weight:900;margin:0 0 8px;text-align:center;letter-spacing:-0.5px;">Verify your email</h1>
    <p style="color:#6B7280;font-size:14px;text-align:center;margin:0 0 28px;line-height:1.6;">
      Welcome to eClean! Click the button below to verify your email address and activate your account.
      This link expires in <strong style="color:#374151;">24 hours</strong>.
    </p>
    <div style="text-align:center;margin-bottom:28px;">
      ${primaryButton('Verify Email Address', url, '#16A34A')}
    </div>
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:14px 18px;">
      <p style="color:#166534;font-size:12px;margin:0;line-height:1.6;">
        🔒 <strong>Your account is secure.</strong> We'll never ask for your password by email.
      </p>
    </div>
  `)

  const { error } = await client.emails.send({ from: FROM, to, subject: '✅ Verify your eClean email', html })
  if (error) logger.error({ to, error }, 'sendVerificationEmail failed')
}

// ─── sendPasswordResetEmail ───────────────────────────────────────────────────

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url    = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`
  const client = getClient()

  if (!client) {
    console.log(`[DEV EMAIL] Password reset for ${to} → ${url}`)
    return
  }

  const html = emailShell(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;line-height:1;">🔐</div>
    </div>
    <h1 style="color:#0B0F1C;font-size:22px;font-weight:900;margin:0 0 8px;text-align:center;letter-spacing:-0.5px;">Reset your password</h1>
    <p style="color:#6B7280;font-size:14px;text-align:center;margin:0 0 28px;line-height:1.6;">
      We received a request to reset your eClean password.<br/>
      Click the button below — this link expires in <strong style="color:#374151;">1 hour</strong>.
    </p>
    <div style="text-align:center;margin-bottom:28px;">
      ${primaryButton('Reset My Password', url, '#2952CC')}
    </div>
    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px 18px;">
      <p style="color:#9A3412;font-size:12px;margin:0;line-height:1.6;">
        ⚠️ <strong>Didn't request this?</strong> Your account is safe — simply ignore this email. The link will expire automatically.
      </p>
    </div>
  `)

  const { error } = await client.emails.send({ from: FROM, to, subject: '🔐 Reset your eClean password', html })
  if (error) logger.error({ to, error }, 'sendPasswordResetEmail failed')
}
