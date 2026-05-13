import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "subtle";
  children: ReactNode;
};

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: "primary" | "secondary" | "ghost" | "subtle";
  children: ReactNode;
};

function buttonClassName(variant: ButtonProps["variant"], className?: string) {
  return ["button", `button-${variant || "secondary"}`, className].filter(Boolean).join(" ");
}

export function Button({ variant = "secondary", className, children, ...props }: ButtonProps) {
  return (
    <button className={buttonClassName(variant, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "secondary", className, children, ...props }: ButtonLinkProps) {
  return (
    <a className={buttonClassName(variant, className)} {...props}>
      {children}
    </a>
  );
}
