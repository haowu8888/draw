import { AlertDialog as BAlertDialog } from "@base-ui/react/alert-dialog";
import { Avatar as BAvatar } from "@base-ui/react/avatar";
import { Checkbox as BCheckbox } from "@base-ui/react/checkbox";
import { ContextMenu as BContextMenu } from "@base-ui/react/context-menu";
import { Dialog as BDialog } from "@base-ui/react/dialog";
import { Menu as BMenu } from "@base-ui/react/menu";
import { Popover as BPopover } from "@base-ui/react/popover";
import { Select as BSelect } from "@base-ui/react/select";
import { Switch as BSwitch } from "@base-ui/react/switch";
import { Tabs as BTabs } from "@base-ui/react/tabs";
import { Tooltip as BTooltip } from "@base-ui/react/tooltip";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------- Button ----------------

const buttonVariants = {
  default: "bg-primary text-primary-foreground shadow-xs-soft hover:bg-primary/90 border border-primary",
  outline: "border border-input bg-card text-foreground shadow-xs-soft hover:bg-accent",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent",
  ghost: "text-foreground hover:bg-accent border border-transparent",
  destructive: "bg-destructive text-white shadow-xs-soft hover:bg-destructive/90 border border-destructive",
  "destructive-outline": "border border-input bg-card text-destructive-foreground shadow-xs-soft hover:bg-destructive/5",
  link: "text-foreground underline-offset-4 hover:underline border border-transparent",
} as const;

const buttonSizes = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-2.5 text-sm gap-1.5 rounded-lg",
  default: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
  icon: "size-9 rounded-lg",
  "icon-sm": "size-8 rounded-lg",
  "icon-xs": "size-7 rounded-md",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted-foreground", className)} />;
}

// ---------------- Inputs ----------------

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm shadow-xs-soft transition-shadow outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-60 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-16 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs-soft outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function Field({ label, error, hint, children, className }: { label?: React.ReactNode; error?: string | null; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive-foreground">{error}</p>}
    </div>
  );
}

// ---------------- Card / Badge / Separator ----------------

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border bg-card text-card-foreground shadow-xs-soft", className)} {...props} />;
}

const badgeVariants = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-input text-foreground",
  success: "bg-success/10 text-success-foreground",
  warning: "bg-warning/10 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive-foreground",
  info: "bg-info/10 text-info-foreground",
};

export function Badge({ className, variant = "secondary", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof badgeVariants }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap", badgeVariants[variant], className)} {...props} />;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div className={cn("shrink-0 bg-border", vertical ? "h-full w-px" : "h-px w-full", className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("ml-auto font-sans text-xs tracking-wide text-muted-foreground", className)}>{children}</kbd>;
}

// ---------------- Avatar ----------------

const AVATAR_COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fed7aa", "#a5f3fc"];

export function Avatar({ name, src, className, color }: { name?: string | null; src?: string | null; className?: string; color?: string }) {
  const n = name || "?";
  const initials = /^[\x00-\x7f]/.test(n) ? n.slice(0, 2).toUpperCase() : n.slice(0, 1);
  const bg = color ?? "var(--muted)";
  return (
    <BAvatar.Root className={cn("inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium select-none", className)} style={{ background: bg }}>
      {src && <BAvatar.Image src={src} className="size-full object-cover" />}
      <BAvatar.Fallback>{initials}</BAvatar.Fallback>
    </BAvatar.Root>
  );
}

export const avatarColor = (id: string) => AVATAR_COLORS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

// ---------------- Dialog ----------------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <BDialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
          <BDialog.Popup
            className={cn(
              "relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col rounded-2xl border bg-popover text-popover-foreground shadow-lg transition-[opacity,scale] duration-200 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              className,
            )}
          >
            {(title || description) && (
              <div className="flex flex-col gap-1 p-6 pb-3">
                {title && <BDialog.Title className="pr-6 text-lg leading-tight font-semibold">{title}</BDialog.Title>}
                {description && <BDialog.Description className="text-sm text-muted-foreground">{description}</BDialog.Description>}
              </div>
            )}
            <div className={cn("min-h-0 flex-1 overflow-y-auto px-6", !title && !description && "pt-6", !footer && "pb-6")}>{children}</div>
            {footer && <div className="flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
            <BDialog.Close className="absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-md opacity-70 hover:bg-accent hover:opacity-100" aria-label="关闭">
              <X className="size-4" />
            </BDialog.Close>
          </BDialog.Popup>
        </BDialog.Viewport>
      </BDialog.Portal>
    </BDialog.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <BDialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l bg-popover shadow-lg transition-transform duration-200 outline-none data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
            className,
          )}
        >
          <div className="flex flex-col gap-1 p-5 pb-3">
            {title && <BDialog.Title className="pr-6 text-lg font-semibold">{title}</BDialog.Title>}
            {description && <BDialog.Description className="text-sm text-muted-foreground">{description}</BDialog.Description>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          <BDialog.Close className="absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-md opacity-70 hover:bg-accent hover:opacity-100" aria-label="关闭">
            <X className="size-4" />
          </BDialog.Close>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  );
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确定",
  cancelText = "取消",
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: React.ReactNode;
  cancelText?: React.ReactNode;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <BAlertDialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <BAlertDialog.Portal>
        <BAlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BAlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <BAlertDialog.Popup className="w-full max-w-md rounded-2xl border bg-popover p-6 shadow-lg transition-[opacity,scale] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <BAlertDialog.Title className="text-lg font-semibold">{title}</BAlertDialog.Title>
            {description && <BAlertDialog.Description className="mt-1.5 text-sm text-muted-foreground">{description}</BAlertDialog.Description>}
            {children}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {cancelText}
              </Button>
              <Button variant={destructive ? "destructive" : "default"} loading={loading} onClick={onConfirm}>
                {confirmText}
              </Button>
            </div>
          </BAlertDialog.Popup>
        </BAlertDialog.Viewport>
      </BAlertDialog.Portal>
    </BAlertDialog.Root>
  );
}

// ---------------- Menu ----------------

const popupCls =
  "z-50 min-w-36 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none origin-[var(--transform-origin)] transition-[opacity,scale] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";
const itemCls =
  "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function Menu({
  trigger,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
  open,
  onOpenChange,
}: {
  trigger: React.ReactElement;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <BMenu.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      <BMenu.Trigger render={trigger} />
      <BMenu.Portal>
        <BMenu.Positioner align={align} side={side} sideOffset={sideOffset} className="z-50">
          <BMenu.Popup className={cn(popupCls, className)}>{children}</BMenu.Popup>
        </BMenu.Positioner>
      </BMenu.Portal>
    </BMenu.Root>
  );
}

export function MenuItem({ className, destructive, ...props }: React.ComponentProps<typeof BMenu.Item> & { destructive?: boolean }) {
  return <BMenu.Item className={cn(itemCls, destructive && "text-destructive-foreground [&_svg]:!text-destructive-foreground", className as string)} {...props} />;
}

export function MenuSeparator() {
  return <BMenu.Separator className="mx-1 my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{children}</div>;
}

export function SubMenu({ label, icon, children }: { label: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <BMenu.SubmenuRoot>
      <BMenu.SubmenuTrigger className={cn(itemCls, "data-[popup-open]:bg-accent")}>
        {icon}
        <span className="flex-1">{label}</span>
        <span className="text-muted-foreground">›</span>
      </BMenu.SubmenuTrigger>
      <BMenu.Portal>
        <BMenu.Positioner side="right" align="start" sideOffset={4} className="z-50">
          <BMenu.Popup className={cn(popupCls, "max-h-80 overflow-y-auto")}>{children}</BMenu.Popup>
        </BMenu.Positioner>
      </BMenu.Portal>
    </BMenu.SubmenuRoot>
  );
}

export function ContextMenu({ children, menu, disabled }: { children: React.ReactElement; menu: React.ReactNode; disabled?: boolean }) {
  if (disabled) return children;
  return (
    <BContextMenu.Root>
      <BContextMenu.Trigger render={children} />
      <BContextMenu.Portal>
        <BContextMenu.Positioner className="z-50">
          <BContextMenu.Popup className={popupCls}>{menu}</BContextMenu.Popup>
        </BContextMenu.Positioner>
      </BContextMenu.Portal>
    </BContextMenu.Root>
  );
}

// ---------------- Popover / Tooltip ----------------

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  side = "bottom",
  align = "center",
  sideOffset = 6,
  className,
}: {
  trigger: React.ReactElement;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
}) {
  return (
    <BPopover.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      <BPopover.Trigger render={trigger} />
      <BPopover.Portal>
        <BPopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
          <BPopover.Popup className={cn(popupCls, "p-3", className)}>{children}</BPopover.Popup>
        </BPopover.Positioner>
      </BPopover.Portal>
    </BPopover.Root>
  );
}

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return children;
  return (
    <BTooltip.Root>
      <BTooltip.Trigger render={children} />
      <BTooltip.Portal>
        <BTooltip.Positioner side={side} sideOffset={6} className="z-[60]">
          <BTooltip.Popup className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow-md transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-neutral-100 dark:text-neutral-900">
            {content}
          </BTooltip.Popup>
        </BTooltip.Positioner>
      </BTooltip.Portal>
    </BTooltip.Root>
  );
}

export const TooltipProvider = BTooltip.Provider;

// ---------------- Select ----------------

export interface Option<T extends string = string> {
  value: T;
  label: React.ReactNode;
  description?: React.ReactNode;
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
  size = "default",
}: {
  value: T | null;
  onValueChange: (v: T) => void;
  options: Option<T>[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  const current = options.find((o) => o.value === value);
  return (
    <BSelect.Root value={value} onValueChange={(v) => v != null && onValueChange(v as T)} disabled={disabled}>
      <BSelect.Trigger
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 data-[popup-open]:border-ring",
          size === "sm" ? "h-8" : "h-9",
          className,
        )}
      >
        <span className={cn("truncate", !current && "text-muted-foreground")}>{current?.label ?? placeholder}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </BSelect.Trigger>
      <BSelect.Portal>
        <BSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-50">
          <BSelect.Popup className={cn(popupCls, "max-h-80 min-w-[var(--anchor-width)] overflow-y-auto")}>
            <BSelect.List>
              {options.map((o) => (
                <BSelect.Item key={o.value} value={o.value} className={cn(itemCls, "h-auto min-h-8 py-1.5")}>
                  <div className="flex flex-1 flex-col">
                    <BSelect.ItemText>{o.label}</BSelect.ItemText>
                    {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
                  </div>
                  <BSelect.ItemIndicator>
                    <Check className="size-4" />
                  </BSelect.ItemIndicator>
                </BSelect.Item>
              ))}
            </BSelect.List>
          </BSelect.Popup>
        </BSelect.Positioner>
      </BSelect.Portal>
    </BSelect.Root>
  );
}

// ---------------- Tabs ----------------

export function SegmentTabs<T extends string>({ value, onValueChange, items, className }: { value: T; onValueChange: (v: T) => void; items: Option<T>[]; className?: string }) {
  return (
    <BTabs.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <BTabs.List className={cn("relative inline-flex h-9 items-center rounded-lg bg-muted p-0.5", className)}>
        {items.map((it) => (
          <BTabs.Tab
            key={it.value}
            value={it.value}
            className="relative z-10 h-full rounded-md px-2.5 text-sm text-muted-foreground transition-colors outline-none data-[selected]:text-foreground"
          >
            {it.label}
          </BTabs.Tab>
        ))}
        <BTabs.Indicator className="absolute top-[var(--active-tab-top)] left-[var(--active-tab-left)] h-[var(--active-tab-height)] w-[var(--active-tab-width)] rounded-md bg-card shadow-sm transition-all duration-200" />
      </BTabs.List>
    </BTabs.Root>
  );
}

export function UnderlineTabs<T extends string>({ value, onValueChange, items, className }: { value: T; onValueChange: (v: T) => void; items: Option<T>[]; className?: string }) {
  return (
    <BTabs.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <BTabs.List className={cn("relative flex items-center gap-1 border-b", className)}>
        {items.map((it) => (
          <BTabs.Tab
            key={it.value}
            value={it.value}
            className="flex h-9 items-center gap-1.5 px-2 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground data-[selected]:font-medium data-[selected]:text-foreground [&_svg]:size-4"
          >
            {it.label}
          </BTabs.Tab>
        ))}
        <BTabs.Indicator className="absolute bottom-[-1px] left-[var(--active-tab-left)] h-0.5 w-[var(--active-tab-width)] rounded-full bg-foreground transition-all duration-200" />
      </BTabs.List>
    </BTabs.Root>
  );
}

// ---------------- Switch / Checkbox ----------------

export function Switch({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (c: boolean) => void; disabled?: boolean }) {
  return (
    <BSwitch.Root
      checked={checked}
      onCheckedChange={(c) => onCheckedChange(c)}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors data-[checked]:bg-primary data-[disabled]:opacity-60"
    >
      <BSwitch.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-4" />
    </BSwitch.Root>
  );
}

export function Checkbox({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (c: boolean) => void; disabled?: boolean }) {
  return (
    <BCheckbox.Root
      checked={checked}
      onCheckedChange={(c) => onCheckedChange(c)}
      disabled={disabled}
      className="flex size-4 shrink-0 items-center justify-center rounded border border-input bg-card shadow-xs-soft data-[checked]:border-primary data-[checked]:bg-primary"
    >
      <BCheckbox.Indicator className="text-primary-foreground">
        <Check className="size-3" />
      </BCheckbox.Indicator>
    </BCheckbox.Root>
  );
}

// ---------------- Empty / Table ----------------

export function Empty({ icon, title, description, children, className }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}>
      {icon && <div className="mb-2 flex size-9 items-center justify-center rounded-lg border bg-card shadow-xs-soft [&_svg]:size-4">{icon}</div>}
      <div className="text-lg font-semibold">{title}</div>
      {description && <div className="max-w-sm text-sm text-muted-foreground">{description}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border bg-card", className)}>
      <table className="w-full caption-bottom text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:text-muted-foreground [&_thead]:bg-muted/50 [&_tr]:border-b [&_tbody_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-muted/40">
        {children}
      </table>
    </div>
  );
}
