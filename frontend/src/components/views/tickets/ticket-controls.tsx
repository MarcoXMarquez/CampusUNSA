
import React from "react";
import { ApiRequestError } from "@/lib/api-client";
import { secretarialTicketMessages as messages } from "@/lib/messages/secretarial-ticket-messages";

export const ticketCard = "min-w-0 rounded-2xl border border-subtle bg-surface-card p-4 space-y-3";
export const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-control px-3 py-2 text-ios-footnote font-semibold text-brand-action interactive-surface disabled:opacity-50";
export const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-cta px-4 py-2 text-ios-footnote font-semibold text-white interactive-cta disabled:opacity-50";
export const input = "min-h-11 w-full min-w-0 rounded-xl border border-control bg-surface-card px-3 py-2 text-ios-body text-ink-primary";
export const label = "block space-y-1 text-ios-footnote font-medium text-ink-secondary";

export function ticketErrorStatus(error: unknown): number | undefined {
  return error instanceof ApiRequestError ? error.status : undefined;
}

export function TicketIssue({
  error, onRetry, onReconnect,
}: {
  error: unknown;
  onRetry?: () => void;
  onReconnect: () => void;
}): React.JSX.Element {
  const status = ticketErrorStatus(error);
  const text = status === 401 ? messages.expired
    : status === 403 || status === 404 ? messages.inaccessible
    : status === 422 ? messages.inputInvalid
    : status === 409 ? messages.conflict
    : messages.failed;
  const recover = status === 401 ? onReconnect : onRetry;
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-subtle bg-surface-inset p-3 text-ios-footnote text-ink-secondary">
      <p>{text}</p>
      {recover && (
        <button className={secondaryButton} type="button" onClick={recover}>
          {status === 401 ? messages.reconnect : messages.retry}
        </button>
      )}
    </div>
  );
}

export function TicketSkeleton(): React.JSX.Element {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{messages.loading}</span>
      <div aria-hidden="true" className="h-14 rounded-xl bg-surface-inset motion-safe:animate-pulse" />
      <div aria-hidden="true" className="h-14 rounded-xl bg-surface-inset motion-safe:animate-pulse" />
    </div>
  );
}
