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
    secure: Number(env.SMTP_PORT) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  })
}

// ── Invitation Email ──────────────────────────────────────────────────────────

export interface InvitationEmailData {
  toEmail: string
  inviterName: string
  boardTitle: string
  invitationToken: string
}

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
    subject: `${data.inviterName} vous invite à rejoindre "${data.boardTitle}" sur Laneo`,
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
  <title>Invitation Laneo</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#6500FF;padding:32px 40px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Laneo</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">
                Vous avez été invité(e) à collaborer
              </h1>
              <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
                <strong>${data.inviterName}</strong> vous invite à rejoindre le board :
              </p>
              <p style="margin:0 0 32px;color:#6500FF;font-size:17px;font-weight:600;">
                "${data.boardTitle}"
              </p>
              <a href="${data.acceptUrl}"
                 style="display:inline-block;background:#6500FF;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
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
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} Laneo — Cet email vous a été envoyé car quelqu'un a entré votre adresse.
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

// ── Card Assigned Email ───────────────────────────────────────────────────────

export interface CardAssignedEmailData {
  toEmail: string
  assignerName: string
  boardTitle: string
  boardId: string
  cardId: string
  cardTitle: string
  cardDescription?: string
  columnTitle?: string
  deadline?: string
  labels?: { text: string; color: string }[]
}

/**
 * Envoie un email lorsqu'un membre est assigné à une carte.
 */
export async function sendCardAssignedEmail(data: CardAssignedEmailData): Promise<void> {
  const cardUrl = `${env.APP_URL}/board/${data.boardId}?card=${data.cardId}`
  const transporter = createTransporter()

  if (!transporter) {
    console.log('─────────────────────────────────────────────────────')
    console.log('[EMAIL - DEV MODE] Card-assigned non envoyé (SMTP non configuré)')
    console.log(`  To       : ${data.toEmail}`)
    console.log(`  Board    : ${data.boardTitle}`)
    console.log(`  Card     : ${data.cardTitle}`)
    console.log(`  Assigner : ${data.assignerName}`)
    console.log(`  Link     : ${cardUrl}`)
    console.log('─────────────────────────────────────────────────────')
    return
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.toEmail,
    subject: `${data.assignerName} vous a assigné une tâche : "${data.cardTitle}"`,
    html: buildCardAssignedHtml({ ...data, cardUrl }),
  })
}

function buildCardAssignedHtml(data: CardAssignedEmailData & { cardUrl: string }): string {
  const deadlineBlock = data.deadline
    ? `<tr>
        <td style="padding:4px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top;">📅 Échéance</td>
        <td style="padding:4px 0;color:#111827;font-size:14px;font-weight:500;">${new Date(data.deadline).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
      </tr>`
    : ''

  const columnBlock = data.columnTitle
    ? `<tr>
        <td style="padding:4px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top;">📋 Colonne</td>
        <td style="padding:4px 0;color:#111827;font-size:14px;font-weight:500;">${data.columnTitle}</td>
      </tr>`
    : ''

  const descBlock = data.cardDescription
    ? `<tr>
        <td colspan="2" style="padding:12px 0 4px;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">📝 Description</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(data.cardDescription).replace(/\n/g, '<br/>')}</div>
        </td>
      </tr>`
    : ''

  const labelsBlock = data.labels && data.labels.length > 0
    ? `<tr>
        <td colspan="2" style="padding:8px 0;">
          ${data.labels.map((l) => `<span style="display:inline-block;background:${l.color};color:#fff;font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;margin-right:6px;">${escapeHtml(l.text)}</span>`).join('')}
        </td>
      </tr>`
    : ''

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nouvelle tâche assignée — Laneo</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#6500FF;padding:32px 40px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Laneo</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">
                Nouvelle tâche assignée
              </h1>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                <strong>${escapeHtml(data.assignerName)}</strong> vous a assigné une tâche sur le board
                <strong style="color:#6500FF;">"${escapeHtml(data.boardTitle)}"</strong> :
              </p>

              <!-- Card info -->
              <div style="background:#faf8ff;border:1px solid #e8e2f3;border-radius:8px;padding:20px;margin-bottom:24px;">
                <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#1e1535;">${escapeHtml(data.cardTitle)}</h2>
                <table cellpadding="0" cellspacing="0" style="width:100%;">
                  ${columnBlock}
                  ${deadlineBlock}
                  ${labelsBlock}
                  ${descBlock}
                </table>
              </div>

              <a href="${data.cardUrl}"
                 style="display:inline-block;background:#6500FF;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                Voir la tâche
              </a>
              <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">
                Ou copiez ce lien : ${data.cardUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} Laneo — Vous recevez cet email car une tâche vous a été assignée.
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
