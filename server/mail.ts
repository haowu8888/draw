import nodemailer from "nodemailer";
import { config } from "./config";

const smtp = config.smtp;
const transport = smtp ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.pass } }) : null;

/** Sends mail through SMTP when configured; otherwise prints it to the server log (dev mode). */
export async function sendMail(to: string, subject: string, text: string) {
  if (!transport || !smtp) {
    console.log(`\n[mail] to=${to}\n[mail] ${subject}\n[mail] ${text}\n`);
    return;
  }
  await transport.sendMail({ from: smtp.from, to, subject, text });
}
