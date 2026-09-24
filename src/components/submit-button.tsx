"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText = "Salvando...",
  formAction,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} formAction={formAction}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Botão de apagar com confirmação. */
export function DeleteButton({
  children = "Apagar",
  className = "btn btn-sm btn-danger",
  formAction,
  confirmText = "Tem certeza que quer apagar?",
}: {
  children?: ReactNode;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  confirmText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      formAction={formAction}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {pending ? "..." : children}
    </button>
  );
}
