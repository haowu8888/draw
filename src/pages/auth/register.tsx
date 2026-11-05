import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { AuthLayout, isEmail, OtpInput, PasswordInput, redirectTarget, useCountdown } from "./shared";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otp, setOtp] = useState("");
  const cd = useCountdown();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: "" }));
  };

  const finish = async () => {
    const r = await authClient.signIn.email({ email: form.email, password: form.password });
    if (r.error) {
      toast.success("注册成功，请登录");
      return navigate("/login");
    }
    navigate(redirectTarget(), { replace: true });
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "请输入用户名";
    if (!form.email) e.email = "请输入邮箱";
    else if (!isEmail(form.email)) e.email = "请输入有效的邮箱";
    if (form.password.length < 8) e.password = "请输入密码（至少 8 位）";
    if (form.confirm !== form.password) e.confirm = "两次输入的密码不一致";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { data, error } = await authClient.signUp.email({ name: form.name.trim(), email: form.email, password: form.password });
    setBusy(false);
    if (error) return toast.error(`注册失败: ${error.message ?? "请稍后重试"}`);
    if (data?.token) return finish();
    cd.start();
    setVerifying(true);
  };

  const verify = async (code = otp) => {
    if (code.length !== 6) return;
    setBusy(true);
    const { error } = await authClient.emailOtp.verifyEmail({ email: form.email, otp: code });
    if (error) {
      setBusy(false);
      return toast.error("验证失败，请检查验证码");
    }
    await finish();
    setBusy(false);
  };

  const resend = async () => {
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: form.email, type: "email-verification" });
    if (error) return toast.error(`验证码发送失败: ${error.message ?? "请稍后重试"}`);
    cd.start();
  };

  if (verifying) {
    return (
      <AuthLayout
        title="验证邮箱"
        description={
          <>
            验证码已发送至 <span className="font-medium text-foreground">{form.email}</span>，请输入验证码完成注册
          </>
        }
        footer={
          <button className="hover:text-foreground" onClick={() => setVerifying(false)}>
            返回
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <OtpInput value={otp} onChange={setOtp} onComplete={(v) => verify(v)} />
          <Button loading={busy} disabled={otp.length !== 6} onClick={() => verify()}>
            {busy ? "验证中..." : "验证并完成注册"}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            {cd.left > 0 ? (
              <span>{cd.left}s 后可重新发送</span>
            ) : (
              <button className="font-medium text-foreground hover:underline" onClick={resend}>
                重新发送验证码
              </button>
            )}
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="注册"
      description="创建账号，开始画图"
      footer={
        <>
          已有账号？
          <Link to={`/login${location.search}`} className="font-medium text-foreground hover:underline">
            返回登录
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="用户名" error={errors.name}>
          <Input autoFocus placeholder="请输入用户名" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="邮箱" error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="请输入邮箱"
            value={form.email}
            onChange={set("email")}
            onBlur={() => !form.name && form.email.includes("@") && setForm((f) => ({ ...f, name: f.email.split("@")[0] }))}
          />
        </Field>
        <Field label="密码" error={errors.password}>
          <PasswordInput autoComplete="new-password" placeholder="请输入密码（至少 8 位）" value={form.password} onChange={set("password")} />
        </Field>
        <Field label="确认密码" error={errors.confirm}>
          <PasswordInput autoComplete="new-password" placeholder="请再次输入密码" value={form.confirm} onChange={set("confirm")} />
        </Field>
        <Button type="submit" loading={busy}>
          {busy ? "注册中..." : "注册"}
        </Button>
      </form>
    </AuthLayout>
  );
}
