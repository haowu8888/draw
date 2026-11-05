import nodemailer from "nodemailer";

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE ?? "true") !== "false",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

/** Sends mail through SMTP when configured; otherwise prints it to the server log (dev mode). */
export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    console.log(`\n[mail] to=${to}\n[mail] ${subject}\n[mail] ${text}\n`);
    return;
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
}
