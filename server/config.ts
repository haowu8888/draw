/**
 * All runtime configuration, read once from the environment (see .env.example).
 * Deployment-specific values (public URL, secrets, SMTP…) live only here — never in code.
 */
const env = process.env;
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const bool = (v: string | undefined, fallback: boolean) => (v === undefined || v === "" ? fallback : !["false", "0", "no", "off"].includes(v.toLowerCase()));

const DEV_SECRET = "dev-secret-please-change-me-0123456789";
export const isProduction = env.NODE_ENV === "production";

/** Public origin users open in the browser, e.g. https://draw.example.com (no trailing slash). */
const publicUrl = (env.PUBLIC_URL || env.BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
const smtpHost = env.SMTP_HOST || "";

export const config = {
  port: Number(env.PORT || 3000),
  dataDir: env.DATA_DIR || "data",
  publicUrl,
  /** Origins allowed to call the auth API; wildcards like https://*.example.com are supported. */
  trustedOrigins: [...new Set([publicUrl, ...list(env.TRUSTED_ORIGINS), ...(isProduction ? [] : ["http://localhost:5173", "http://localhost:3000"])])],
  authSecret: env.AUTH_SECRET || DEV_SECRET,
  /** Secure cookies need HTTPS; defaults to whether the public URL is https. */
  cookieSecure: bool(env.COOKIE_SECURE, publicUrl.startsWith("https://")),
  /** Email verification only makes sense when mail can actually be sent. */
  requireEmailVerification: bool(env.REQUIRE_EMAIL_VERIFICATION, !!smtpHost),
  smtp: smtpHost
    ? {
        host: smtpHost,
        port: Number(env.SMTP_PORT || 465),
        secure: bool(env.SMTP_SECURE, true),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM || env.SMTP_USER,
      }
    : null,
  redisUrl: env.REDIS_URL || "",
};

/** Fails fast on unsafe production settings and logs the effective (non-secret) config. */
function checkConfig() {
  const problems: string[] = [];
  if (isProduction && config.authSecret === DEV_SECRET) problems.push("AUTH_SECRET 未设置（生产环境必须设置为至少 32 位的随机字符串）");
  if (isProduction && config.authSecret.length < 32) problems.push("AUTH_SECRET 太短（至少 32 位）");
  if (isProduction && !env.PUBLIC_URL && !env.BASE_URL) problems.push("PUBLIC_URL 未设置（填用户在浏览器里访问的地址，如 https://draw.example.com）");
  if (problems.length) {
    console.error(`[draw] 配置错误：\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(
    `[draw] public url ${config.publicUrl} · trusted origins ${config.trustedOrigins.join(", ")} · secure cookies ${config.cookieSecure} · email verification ${config.requireEmailVerification} · smtp ${config.smtp ? config.smtp.host : "off (codes go to this log)"}`,
  );
}

// runs on first import, before auth / database initialization
checkConfig();
