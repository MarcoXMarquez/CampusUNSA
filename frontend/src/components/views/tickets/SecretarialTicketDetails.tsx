
import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { transitionTicket, withdrawTicket, type SecretarialTicketDetail, type TicketStatus } from "@/lib/api-client";
import { secretarialTicketMessages as messages } from "@/lib/messages/secretarial-ticket-messages";
import { input, label, primaryButton, secondaryButton, ticketCard, TicketIssue } from "./ticket-controls";

const dateFormat = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima",
});
const nextAction = { OPEN: "IN_REVIEW", IN_REVIEW: "RESOLVED", RESOLVED: "CLOSED", CLOSED: null } as const;

export function SecretarialTicketDetails({
  token, ticket, staff, isOnline, onChanged, onRefresh, onReconnect,
}: {
  token: string;
  ticket: SecretarialTicketDetail;
  staff: boolean;
  isOnline: boolean;
  onChanged: (value?: SecretarialTicketDetail) => void;
  onRefresh: () => void;
  onReconnect: () => void;
}): React.JSX.Element {
  const [resolution, setResolution] = useState("");
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const update = useMutation({
    mutationFn: (action: TicketStatus | "withdraw") => action === "withdraw"
      ? withdrawTicket(token, ticket.id).then(() => undefined)
      : transitionTicket(token, ticket.id, {
        status: action, ...(action === "RESOLVED" ? { resolution: resolution.trim() } : {}),
      }),
    onSuccess: (result) => {
      setConfirmWithdrawal(false);
      onChanged(result);
    },
  });
  const disabled = !isOnline || update.isPending;
  const action = staff ? nextAction[ticket.status] : null;
  return (
    <>
      <article className={ticketCard}>
        <p className="break-words text-ios-footnote font-semibold text-brand-action">{ticket.tracking_code}</p>
        <h2 className="break-words text-ios-title-2 font-semibold">{ticket.subject}</h2>
        <p className="break-words text-ios-footnote text-ink-secondary">
          {messages.statuses[ticket.status]}{ticket.faculty && ` · ${ticket.faculty}`}
        </p>
        {ticket.description && <p className="whitespace-pre-wrap break-words text-ios-body">{ticket.description}</p>}
        {ticket.resolution && (
          <div className="space-y-1 rounded-xl border border-subtle bg-surface-inset p-3">
            <h3 className="text-ios-footnote font-semibold">{messages.resolution}</h3>
            <p className="whitespace-pre-wrap break-words text-ios-body">{ticket.resolution}</p>
          </div>
        )}
        {action === "IN_REVIEW" && (
          <button className={primaryButton} type="button" disabled={disabled}
            onClick={() => update.mutate(action)}>{messages.beginReview}</button>
        )}
        {action === "RESOLVED" && (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            if (!disabled && resolution.trim().length >= 4) update.mutate(action);
          }}>
            <label className={label}>
              <span>{messages.resolution}</span>
              <textarea className={input} rows={4} required minLength={4} maxLength={4000} value={resolution}
                onChange={(event) => setResolution(event.target.value)} />
            </label>
            <button className={primaryButton} type="submit" disabled={disabled || resolution.trim().length < 4}>
              {messages.resolve}
            </button>
          </form>
        )}
        {action === "CLOSED" && (
          <button className={secondaryButton} type="button" disabled={disabled}
            onClick={() => update.mutate(action)}>{messages.close}</button>
        )}
        {!staff && ticket.status === "OPEN" && (
          confirmWithdrawal ? (
            <div className="space-y-2">
              <p role="status" className="text-ios-footnote">{messages.confirmWithdrawal}</p>
              <div className="flex flex-wrap gap-2">
                <button className={secondaryButton} type="button" onClick={() => setConfirmWithdrawal(false)}>
                  {messages.cancel}
                </button>
                <button className={primaryButton} type="button" disabled={disabled}
                  onClick={() => update.mutate("withdraw")}>{messages.withdraw}</button>
              </div>
            </div>
          ) : (
            <button className={secondaryButton} type="button" disabled={disabled}
              onClick={() => setConfirmWithdrawal(true)}>{messages.withdraw}</button>
          )
        )}
        {update.error && <TicketIssue error={update.error} onRetry={isOnline ? () => {
          update.reset();
          onRefresh();
        } : undefined} onReconnect={onReconnect} />}
      </article>
      {Boolean(ticket.audit?.length) && (
        <section className={ticketCard}>
          <h3 className="text-ios-headline font-semibold">{messages.history}</h3>
          <ol className="space-y-2">
            {ticket.audit?.map((event, index) => (
              <li key={`${event.created_at}-${index}`} className="flex flex-wrap justify-between gap-x-3 text-ios-footnote">
                <span>{messages.statuses[event.to_status]}</span>
                <time className="text-ink-secondary" dateTime={event.created_at}>
                  {dateFormat.format(new Date(event.created_at))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
