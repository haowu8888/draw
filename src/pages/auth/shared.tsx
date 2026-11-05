import { OTPField } from "@base-ui/react/otp-field";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/common";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export function AuthLayout({ title, description, children, footer }: { title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,#0000001f_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)] dark:bg-[radial-gradient(circle,#ffffff1f_1px,transparent_1px)]" />
      <header className="relative mx-auto flex h-14 w-full max-w-[67.5rem] items-center px-6">
        <Logo />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)]">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-9", props.className)} />
      <button type="button" tabIndex={-1} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function OtpInput({ value, onChange, onComplete, length = 6 }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; length?: number }) {
  return (
    <OTPField.Root
      length={length}
      value={value}
      onValueChange={(v) => onChange(v)}
      onValueComplete={(v) => onComplete?.(v)}
      className="flex justify-between gap-2"
      validationType="numeric"
    >
      {Array.from({ length }, (_, i) => (
        <OTPField.Input
          key={i}
          autoFocus={i === 0}
          className="h-11 w-11 rounded-lg border border-input bg-card text-center text-lg font-medium shadow-xs-soft outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20"
        />
      ))}
    </OTPField.Root>
  );
}

/** Countdown for "重新发送" buttons. */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: (s = 60) => setLeft(s) };
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function redirectTarget() {
  const r = new URLSearchParams(location.search).get("redirect");
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/user/dashboard";
}
