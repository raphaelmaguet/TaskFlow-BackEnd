import nodemailer from 'nodemailer'
import { env } from '../config/env'

/**
 * Crée le transporteur SMTP à partir des variables d'environnement.
 * Si les variables SMTP sont absentes, retourne null (mode dev sans email).
 */
function createTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: Number(env.SMTP_PORT) === 465, // true pour le port 465 (SSL), false sinon (STARTTLS)
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  })
}

export interface InvitationEmailData {
  toEmail: string
  inviterName: string
  boardTitle: string
  invitationToken: string
}

/**
 * Envoie un email d'invitation à rejoindre un board.
 * Si les variables SMTP ne sont pas configurées, logue le lien en console
 * (utile en développement).
 */
export async function sendInvitationEmail(data: InvitationEmailData): Promise<void> {
  const acceptUrl = `${env.APP_URL}/invitation/${data.invitationToken}`
  const transporter = createTransporter()

  if (!transporter) {
    console.log('─────────────────────────────────────────────────────')
    console.log('[EMAIL - DEV MODE] Invitation non envoyée (SMTP non configuré)')
    console.log(`  To      : ${data.toEmail}`)
    console.log(`  Board   : ${data.boardTitle}`)
    console.log(`  Inviter : ${data.inviterName}`)
    console.log(`  Link    : ${acceptUrl}`)
    console.log('─────────────────────────────────────────────────────')
    return
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.toEmail,
    subject: `${data.inviterName} vous invite à rejoindre "${data.boardTitle}" sur TaskFlow`,
    html: buildInvitationHtml({ ...data, acceptUrl }),
  })
}

function buildInvitationHtml(data: InvitationEmailData & { acceptUrl: string }): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitation TaskFlow</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:32px 40px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">TaskFlow</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">
                Vous avez été invité(e) à collaborer
              </h1>
              <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
                <strong>${data.inviterName}</strong> vous invite à rejoindre le board :
              </p>
              <p style="margin:0 0 32px;color:#2563eb;font-size:17px;font-weight:600;">
                "${data.boardTitle}"
              </p>
              <a href="${data.acceptUrl}"
                 style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                Accepter l'invitation
              </a>
              <p style="margin:32px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                Ce lien expire dans <strong>7 jours</strong>. Si vous n'attendiez pas cette invitation, ignorez cet email.
              </p>
              <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">
                Ou copiez ce lien : ${data.acceptUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} TaskFlow — Cet email vous a été envoyé car quelqu'un a entré votre adresse.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
