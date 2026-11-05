import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { AuthLayout, isEmail, PasswordInput, useCountdown } from "./shared";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cd = useCountdown();

  const send = async () => {
    if (!isEmail(email)) return setErrors({ email: email ? "请输入有效的邮箱" : "请输入注册邮箱" });
    setBusy(true);
    const { error } = await authClient.emailOtp.requestPasswordReset({ email });
    setBusy(false);
    if (error) return toast.error(`发送重置邮件失败: ${error.message ?? "发送失败，请稍后重试"}`);
    setSent(true);
    cd.start();
    toast.success(`验证码已发送至 ${email}`);
  };

  const reset = async () => {
    const e: Record<string, string> = {};
    if (otp.length !== 6) e.otp = "请输入邮箱验证码";
    if (password.length < 8) e.password = "请输入新密码（至少 8 位）";
    if (confirm !== password) e.confirm = "两次输入的密码不一致";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
    setBusy(false);
    if (error) return toast.error(error.status === 400 ? "重置失败，请检查验证码" : `重置密码失败: ${error.message ?? "请稍后重试"}`);
    setDone(true);
    toast.success("重置成功");
  };

  if (done) {
    return (
      <AuthLayout title="重置成功" description="密码已重置成功，请使用新密码登录。">
        <Link to="/login">
          <Button className="w-full">去登录</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="忘记密码"
      description="通过邮箱验证码重置密码"
      footer={
        <Link to="/login" className="hover:text-foreground">
          返回登录
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          sent ? reset() : send();
        }}
      >
        <Field label="邮箱" error={errors.email}>
          <div className="flex gap-2">
            <Input type="email" placeholder="请输入注册邮箱" value={email} disabled={sent} onChange={(e) => setEmail(e.target.value.trim())} />
            {sent && (
              <Button variant="outline" disabled={cd.left > 0} onClick={send}>
                {cd.left > 0 ? `${cd.left}s` : "重新发送验证码"}
              </Button>
            )}
          </div>
        </Field>
        {sent && (
          <>
            <Field label="验证码" error={errors.otp}>
              <Input inputMode="numeric" maxLength={6} placeholder="请输入邮箱验证码" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="新密码" error={errors.password}>
              <PasswordInput autoComplete="new-password" placeholder="请输入新密码（至少 8 位）" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="确认密码" error={errors.confirm}>
              <PasswordInput autoComplete="new-password" placeholder="请再次输入新密码" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </>
        )}
        <Button type="submit" loading={busy}>
          {sent ? (busy ? "重置中..." : "重置密码") : busy ? "发送中..." : "发送验证码"}
        </Button>
      </form>
    </AuthLayout>
  );
}
