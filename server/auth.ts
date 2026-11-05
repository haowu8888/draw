import { betterAuth } from "better-auth";
import { admin, emailOTP } from "better-auth/plugins";
import { getMigrations } from "better-auth/db/migration";
import { cleanupUserData } from "./boards";
import { config } from "./config";
import { db } from "./db";
import { sendMail } from "./mail";

const OTP_SUBJECT = {
  "sign-in": "邮箱登录验证码",
  "email-verification": "邮箱验证码",
  "forget-password": "重置密码验证码",
  "change-email": "更换邮箱验证码",
} as const;

export const authOptions = {
  appName: "Draw",
  baseURL: config.publicUrl,
  secret: config.authSecret,
  database: db,
  trustedOrigins: config.trustedOrigins,
  advanced: { useSecureCookies: config.cookieSecure },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: config.requireEmailVerification,
  },
  user: {
    additionalFields: {
      gender: { type: "string", required: false, defaultValue: "secret", input: true },
      bio: { type: "string", required: false, input: true },
    },
    deleteUser: { enabled: true, beforeDelete: async (user) => cleanupUserData(user.id) },
    changeEmail: { enabled: true },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        await sendMail(email, `Draw ${OTP_SUBJECT[type]}`, `你的验证码是 ${otp}，10 分钟内有效。`);
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        // The first registered account becomes the administrator.
        before: async (user: Record<string, unknown>) => {
          const { c } = db.prepare("SELECT count(*) c FROM user").get() as { c: number };
          return { data: { ...user, role: c === 0 ? "admin" : "user" } };
        },
      },
    },
  },
} satisfies Parameters<typeof betterAuth>[0];

// Create / update better-auth tables before the instance boots.
await (await getMigrations(authOptions)).runMigrations();

export const auth = betterAuth(authOptions);

export type Session = typeof auth.$Infer.Session;
