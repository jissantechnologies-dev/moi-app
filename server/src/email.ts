import nodemailer from 'nodemailer';

const APP_URL = process.env.APP_URL ?? 'https://moi.jissantechnologies.online';

/**
 * SMTP is optional. With no credentials configured the link is written to the
 * log instead of sent — that keeps a fresh deployment usable, but it means
 * sign-ups cannot verify themselves until SMTP_* is filled in.
 */
const smtpHost = process.env.SMTP_HOST;
const transport = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
        : undefined,
    })
  : null;

async function send(to: string, subject: string, text: string): Promise<void> {
  if (!transport) {
    console.warn(`[email] SMTP not configured — would have sent to ${to}:\n${text}`);
    return;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `Moi Book <no-reply@${new URL(APP_URL).hostname}>`,
    to,
    subject,
    text,
  });
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${APP_URL}/?verify=${encodeURIComponent(token)}`;
  await send(
    to,
    'Confirm your Moi Book account',
    `Open this link to confirm your email address:\n\n${link}\n\nThe link expires in 24 hours. If you did not create an account, ignore this message.`
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${APP_URL}/?reset=${encodeURIComponent(token)}`;
  await send(
    to,
    'Reset your Moi Book password',
    `Open this link to choose a new password:\n\n${link}\n\nThe link expires in 1 hour. If you did not ask for this, ignore this message — your password has not changed.`
  );
}
