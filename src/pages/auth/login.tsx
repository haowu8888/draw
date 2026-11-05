import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, Checkbox, Field, Input, Separator } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { AuthLayout, isEmail, OtpInput, PasswordInput, redirectTarget, useCountdown } from "./shared";

type Step = { kind: "password" } | { kind: "otp-email" } | { kind: "otp-code"; email: string; purpose: "sign-in" | "email-verification" };

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cd = useCountdown();

  const done = () => navigate(redirectTarget(), { replace: true });

  const sendOtp = async (target: string, purpose: "sign-in" | "email-verification") => {
    setBusy(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: target, type: purpose });
    setBusy(false);
    if (error) return toast.error(`验证码发送失败: ${error.message ?? "请稍后重试"}`);
    cd.start();
    setOtp("");
    setStep({ kind: "otp-code", email: target, purpose });
  };

  const loginWithPassword = async () => {
    const e: Record<string, string> = {};
    if (!email) e.email = "请输入邮箱";
    else if (!isEmail(email)) e.email = "请输入有效的邮箱";
    if (!password) e.password = "请输入密码";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await authClient.signIn.email({ email, password, rememberMe: remember });
    setBusy(false);
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        toast.info("邮箱尚未验证，请输入验证码完成验证");
        return sendOtp(email, "email-verification");
      }
      return toast.error(error.status === 401 ? "登录失败，请检查邮箱和密码" : `登录失败: ${error.message ?? "请稍后重试"}`);
    }
    done();
  };

  const submitOtp = async (code = otp) => {
    if (step.kind !== "otp-code" || code.length !== 6) return;
    setBusy(true);
    if (step.purpose === "sign-in") {
      const { error } = await authClient.signIn.emailOtp({ email: step.email, otp: code });
      setBusy(false);
      if (error) return toast.error("登录失败，请检查验证码");
      return done();
    }
    const { error } = await authClient.emailOtp.verifyEmail({ email: step.email, otp: code });
    if (error) {
      setBusy(false);
      return toast.error("验证失败，请检查验证码");
    }
    const r = await authClient.signIn.email({ email: step.email, password, rememberMe: remember });
    setBusy(false);
    if (r.error) return toast.error("登录失败，请稍后重试");
    done();
  };

  if (step.kind === "otp-code") {
    return (
      <AuthLayout
        title={step.purpose === "sign-in" ? "邮箱登录验证码" : "验证邮箱"}
        description={
          <>
            输入发送到 <span className="font-medium text-foreground">{step.email}</span> 的验证码
          </>
        }
        footer={
          <button className="hover:text-foreground" onClick={() => setStep({ kind: step.purpose === "sign-in" ? "otp-email" : "password" })}>
            返回
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <OtpInput value={otp} onChange={setOtp} onComplete={(v) => submitOtp(v)} />
          <Button loading={busy} disabled={otp.length !== 6} onClick={() => submitOtp()}>
            {busy ? "登录中..." : "登录"}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            没有收到验证码?{" "}
            {cd.left > 0 ? (
              <span>{cd.left}s 后重新发送</span>
            ) : (
              <button className="font-medium text-foreground hover:underline" onClick={() => sendOtp(step.email, step.purpose)}>
                重新发送
              </button>
            )}
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="登录"
      description="欢迎回来，登录后继续你的创作"
      footer={
        <>
          还没有账号？
          <Link to={`/register${location.search}`} className="font-medium text-foreground hover:underline">
            注册
          </Link>
        </>
      }
    >
      {step.kind === "password" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            loginWithPassword();
          }}
        >
          <Field label="邮箱" error={errors.email}>
            <Input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} aria-invalid={!!errors.email} />
          </Field>
          <Field
            label={
              <span className="flex items-center justify-between">
                密码
                <Link to="/forgot-password" className="text-xs font-normal text-muted-foreground hover:text-foreground">
                  忘记密码？
                </Link>
              </span>
            }
            error={errors.password}
          >
            <PasswordInput autoComplete="current-password" placeholder="请输入密码" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={setRemember} />
            记住我
          </label>
          <Button type="submit" loading={busy}>
            {busy ? "登录中..." : "登录"}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isEmail(email)) return setErrors({ email: "请输入有效的邮箱" });
            sendOtp(email, "sign-in");
          }}
        >
          <Field label="邮箱" error={errors.email}>
            <Input type="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          </Field>
          <Button type="submit" loading={busy}>
            {busy ? "发送中..." : "发送验证码"}
          </Button>
        </form>
      )}
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />或<Separator className="flex-1" />
      </div>
      <Button variant="outline" className="w-full" onClick={() => setStep({ kind: step.kind === "password" ? "otp-email" : "password" })}>
        {step.kind === "password" ? "使用邮箱验证码登录" : "使用密码登录"}
      </Button>
    </AuthLayout>
  );
}
