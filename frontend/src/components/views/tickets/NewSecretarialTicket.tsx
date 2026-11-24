
import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createSecretarialTicket, fetchTicketRouting, type SecretarialTicketDetail } from "@/lib/api-client";
import { secretarialTicketMessages as messages } from "@/lib/messages/secretarial-ticket-messages";
import { input, label, primaryButton, ticketCard, TicketIssue, TicketSkeleton } from "./ticket-controls";

export function NewSecretarialTicket({
  token, userId, isOnline, onCreated, onReconnect,
}: {
  token: string;
  userId: string;
  isOnline: boolean;
  onCreated: (ticket: SecretarialTicketDetail) => void;
  onReconnect: () => void;
}): React.JSX.Element {
  const [requestId] = useState(() => window.crypto.randomUUID());
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [faculty, setFaculty] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const routing = useQuery({
    queryKey: ["secretarial", userId, "routing"],
    queryFn: ({ signal }) => fetchTicketRouting(token, signal),
    enabled: isOnline,
    retry: false,
  });
  const create = useMutation({
    mutationFn: () => createSecretarialTicket(token, {
      request_id: requestId,
      subject: subject.trim(),
      description: description.trim(),
      faculty: routing.data?.faculty || faculty,
      confirmed,
      category: "Administration",
    }),
    onSuccess: onCreated,
  });
  const destination = routing.data?.faculty || faculty;
  const canSubmit = isOnline && !routing.error && Boolean(destination) && confirmed
    && subject.trim().length >= 4 && description.trim().length >= 4 && !create.isPending;
  const alternatives = routing.data?.alternatives ?? [];

  return (
    <form className={ticketCard} onSubmit={(event) => {
      event.preventDefault();
      if (canSubmit) create.mutate();
    }}>
      <h2 className="text-ios-title-3 font-semibold">{messages.newRequest}</h2>
      <label className={label}>
        <span>{messages.subject}</span>
        <input className={input} required minLength={4} maxLength={255} value={subject}
          onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className={label}>
        <span>{messages.description}</span>
        <textarea className={input} rows={4} required minLength={4} maxLength={4000} value={description}
          onChange={(event) => setDescription(event.target.value)} />
      </label>
      {routing.isLoading && <TicketSkeleton />}
      {routing.error && <TicketIssue error={routing.error} onRetry={isOnline ? () => void routing.refetch() : undefined} onReconnect={onReconnect} />}
      {routing.data?.faculty ? (
        <p className="break-words text-ios-footnote text-ink-secondary">{messages.faculty} · {routing.data.faculty}</p>
      ) : alternatives.length > 0 ? (
        <label className={label}>
          <span>{messages.faculty}</span>
          <select className={input} value={faculty} required onChange={(event) => setFaculty(event.target.value)}>
            <option value="">{messages.chooseFaculty}</option>
            {alternatives.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      ) : routing.data && <p role="status" className="text-ios-footnote text-ink-secondary">{messages.noFaculty}</p>}
      <label className="flex min-h-11 items-center gap-3 text-ios-footnote">
        <input className="h-5 w-5 shrink-0 accent-brand-cta" type="checkbox" checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)} />
        <span>{messages.confirmation}</span>
      </label>
      {create.error && <TicketIssue error={create.error} onReconnect={onReconnect} />}
      <button type="submit" className={primaryButton} disabled={!canSubmit}>{messages.send}</button>
    </form>
  );
}
