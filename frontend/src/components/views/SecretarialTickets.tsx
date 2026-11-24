
"use client";

import React, { useState } from "react";
import { ChatsCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeTicketNotice, fetchTicketDetail, fetchTicketNotifications, fetchTicketQueue,
  type SecretarialTicketDetail, type TicketNotice, type TicketStatus,
} from "@/lib/api-client";
import { secretarialTicketMessages as messages } from "@/lib/messages/secretarial-ticket-messages";
import { NewSecretarialTicket } from "./tickets/NewSecretarialTicket";
import { SecretarialTicketDetails } from "./tickets/SecretarialTicketDetails";
import {
  input, label, primaryButton, secondaryButton, ticketCard, ticketErrorStatus, TicketIssue, TicketSkeleton,
} from "./tickets/ticket-controls";

interface Viewer {
  token: string;
  userId: string;
  staff: boolean;
  isOnline: boolean;
}

interface QueueFilters {
  faculty?: string;
  cui?: string;
  status?: TicketStatus;
}

const PAGE_SIZE = 25;
const statuses: TicketStatus[] = ["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"];

export function useTicketNotices(viewer: Viewer | null, poll = false) {
  return useQuery({
    queryKey: ["secretarial", viewer?.userId, "notices"],
    queryFn: ({ signal }) => viewer ? fetchTicketNotifications(viewer.token, signal) : Promise.resolve([]),
    enabled: Boolean(poll && viewer?.isOnline && !viewer.staff),
    refetchInterval: poll ? 5000 : false,
    retry: false,
  });
}

export function SecretarialTicketsEntry({ onOpen, ...viewer }: Viewer & {
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <div className={ticketCard}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-inset text-brand-action">
          <ChatsCircle size={22} aria-hidden="true" />
        </span>
        <p className="text-ios-footnote text-ink-secondary">
          {viewer.staff ? messages.staffTitle : messages.entryDescription}
        </p>
      </div>
      <button type="button" className={`${secondaryButton} w-full`} onClick={onOpen}>
        {messages.entry}
      </button>
    </div>
  );
}

function StaffFilters({ isOnline, onApply }: {
  isOnline: boolean;
  onApply: (filters: QueueFilters) => void;
}): React.JSX.Element {
  const [faculty, setFaculty] = useState("");
  const [cui, setCui] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  return (
    <form className={`${ticketCard} md:grid md:grid-cols-2 md:gap-3 md:space-y-0`} onSubmit={(event) => {
      event.preventDefault();
      onApply({ faculty: faculty.trim(), cui: cui.trim(), status: status || undefined });
    }}>
      <label className={label}>
        <span>{messages.faculty}</span>
        <input className={input} maxLength={120} value={faculty} onChange={(event) => setFaculty(event.target.value)} />
      </label>
      <label className={label}>
        <span>{messages.cui}</span>
        <input className={input} maxLength={20} value={cui} onChange={(event) => setCui(event.target.value)} />
      </label>
      <label className={label}>
        <span>{messages.state}</span>
        <select className={input} value={status} onChange={(event) => {
          const selection = statuses.find((value) => value === event.target.value);
          setStatus(selection ?? "");
        }}>
          <option value="">{messages.active}</option>
          {statuses.map((value) => <option key={value} value={value}>{messages.statuses[value]}</option>)}
        </select>
      </label>
      <button type="submit" className={`${secondaryButton} self-end`} disabled={!isOnline}>
        {messages.search}
      </button>
    </form>
  );
}

export function SecretarialTickets({
  onExit, onReconnect, ...viewer
}: Viewer & {
  onExit: () => void;
  onReconnect: () => void;
}): React.JSX.Element {
  const { token, staff, userId, isOnline } = viewer;
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<QueueFilters>({});
  const [offset, setOffset] = useState(0);
  const client = useQueryClient();
  const key = ["secretarial", userId] as const;
  const detailOptions = (id: string) => ({
    queryKey: [...key, "detail", staff, id],
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchTicketDetail(token, id, signal),
    retry: false,
  });
  const list = useQuery({
    queryKey: [...key, "list", staff, filters, offset],
    queryFn: ({ signal }) => fetchTicketQueue(token, staff ? "all" : "mine", {
      ...filters, offset, limit: PAGE_SIZE,
    }, signal),
    enabled: isOnline,
    retry: false,
  });
  const detail = useQuery({
    ...detailOptions(selectedId ?? ""),
    enabled: isOnline && selectedId !== null,
  });
  const notices = useTicketNotices(viewer);
  const markRead = useMutation({
    mutationFn: async (notice: TicketNotice) => {
      await client.fetchQuery(detailOptions(notice.ticket_id));
      await acknowledgeTicketNotice(token, notice.id);
    },
    onSettled: () => client.invalidateQueries({ queryKey: [...key, "notices"] }),
  });

  function saveDetail(value?: SecretarialTicketDetail): void {
    if (value) client.setQueryData(detailOptions(value.id).queryKey, value);
    void client.invalidateQueries({ queryKey: [...key, "list"] });
    if (!value) void detail.refetch();
  }

  const current = selectedId !== null ? detail : list;
  const hardError = [401, 403, 404].includes(ticketErrorStatus(current.error) ?? 0);
  const showNotices = !staff && !notices.error && Boolean(notices.data?.length);
  const back = () => {
    setCreating(false);
    setSelectedId(null);
    markRead.reset();
  };
  return (
    <section className="min-h-dvh w-full bg-canvas px-5 pb-dock-content pt-6 text-ink-primary">
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4">
        <button type="button" className={secondaryButton} onClick={creating || selectedId ? back : onExit}>
          {creating || selectedId ? messages.backToList : messages.backToHugo}
        </button>
        <h1 className="text-ios-large-title font-extrabold tracking-tight">
          {staff ? messages.staffTitle : messages.studentTitle}
        </h1>
        {!isOnline && <p role="status" className="text-ios-footnote text-ink-secondary">{messages.offline}</p>}
        {!creating && current.error && (
          <TicketIssue error={current.error} onRetry={isOnline ? () => void current.refetch() : undefined} onReconnect={onReconnect} />
        )}
        {!creating && current.isLoading && <TicketSkeleton />}
        {creating && <NewSecretarialTicket token={token} userId={userId} isOnline={isOnline}
          onReconnect={onReconnect} onCreated={(value) => {
            saveDetail(value);
            setCreating(false);
            setSelectedId(value.id);
          }} />}
        {selectedId && !hardError && detail.data && (
          <SecretarialTicketDetails key={selectedId} token={token} ticket={detail.data} staff={staff}
            isOnline={isOnline} onChanged={saveDetail} onReconnect={onReconnect} onRefresh={() => void detail.refetch()} />
        )}
        {markRead.error && !detail.error && <TicketIssue error={markRead.error} onReconnect={onReconnect} />}
        {!selectedId && !creating && !hardError && (
          <>
            {staff ? <StaffFilters isOnline={isOnline} onApply={(value) => {
              setFilters(value);
              setOffset(0);
            }} /> : (
              <button type="button" className={primaryButton} disabled={!isOnline} onClick={() => setCreating(true)}>
                {messages.newRequest}
              </button>
            )}
            {!staff && notices.error && <TicketIssue error={notices.error} onReconnect={onReconnect}
              onRetry={isOnline ? () => void notices.refetch() : undefined} />}
            {showNotices && (
              <section className={ticketCard} aria-label={messages.notices}>
                <h2 className="text-ios-headline font-semibold">{messages.notices}</h2>
                {notices.data?.map((notice) => (
                  <button key={notice.id} className={`${secondaryButton} w-full justify-start`} type="button"
                    onClick={() => {
                      setSelectedId(notice.ticket_id);
                      if (isOnline) markRead.mutate(notice);
                    }}>
                    {messages.noticeLabel(notice.tracking_code)}
                  </button>
                ))}
              </section>
            )}
            {list.data?.length === 0 && (
              <p role="status" className={`${ticketCard} text-ios-footnote text-ink-secondary`}>
                {staff ? messages.emptyQueue : messages.emptyMine}
              </p>
            )}
            {Boolean(list.data?.length) && (
              <ul className="space-y-2">
                {list.data?.map((ticket) => (
                  <li key={ticket.id}>
                    <button type="button" className={`${ticketCard} interactive-surface min-h-11 w-full text-left`}
                      onClick={() => setSelectedId(ticket.id)}>
                      <span className="line-clamp-2 break-words text-ios-headline font-semibold">{ticket.subject}</span>
                      <span className="block break-words text-ios-footnote text-ink-secondary">
                        {ticket.tracking_code} · {messages.statuses[ticket.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {(offset > 0 || list.data?.length === PAGE_SIZE) && (
              <div className="flex justify-between gap-2">
                <button className={secondaryButton} type="button" disabled={!isOnline || offset === 0}
                  onClick={() => setOffset(offset - PAGE_SIZE)}>{messages.previous}</button>
                <button className={secondaryButton} type="button" disabled={!isOnline || list.data?.length !== PAGE_SIZE}
                  onClick={() => setOffset(offset + PAGE_SIZE)}>{messages.next}</button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
