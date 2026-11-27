"use client";

import React, { useContext, useEffect, useState, type FormEvent } from "react";
import { Calendar, Timer } from "@phosphor-icons/react";
import { ApiRequestError, createCalendarSubscription, revokeCalendarSubscription } from "@/lib/api-client";
import { MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES } from "@/lib/focus-timer";
import { studyMessages as messages } from "@/lib/messages/study-messages";
import { FocusContext } from "./FocusSessionProvider";

const control = "interactive-surface min-h-11 rounded-lg border border-control px-3 text-ios-subhead font-semibold text-brand-action";
const input = "min-h-11 w-full rounded-lg border border-control bg-surface-inset px-3 text-ios-body text-ink-primary";

function FocusTimer() {
  const focus = useContext(FocusContext);
  const minutes = focus?.session.minutes ?? 25;
  const [duration, setDuration] = useState(String(minutes));
  useEffect(() => setDuration(String(minutes)), [minutes]);
  if (!focus) return null;

  const { session, remaining, permission } = focus;
  const seconds = Math.ceil(remaining / 1000);
  const clock = [Math.floor(seconds / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
  const running = session.endsAt !== null;
  return (
    <div className="space-y-3 px-4 pb-4">
      <output aria-label={messages.remaining} aria-live="off" className="block text-ios-large-title font-bold tabular-nums">
        {clock}
      </output>
      {remaining === 0 && <p role="status" className="text-ios-subhead text-ink-secondary">{messages.finished}</p>}
      <label className="block text-ios-subhead text-ink-secondary">
        {messages.minutes}
        <input type="number" min={MIN_FOCUS_MINUTES} max={MAX_FOCUS_MINUTES}
          value={duration} disabled={running}
          onChange={(event) => setDuration(event.target.value)}
          onBlur={(event) => {
            const next = event.target.valueAsNumber;
            if (Number.isInteger(next) && next >= MIN_FOCUS_MINUTES && next <= MAX_FOCUS_MINUTES) {
              if (next !== minutes) focus.setDuration(next);
            } else {
              setDuration(String(minutes));
            }
          }}
          className={input} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} onClick={running ? focus.pause : focus.start}>
          {running ? messages.pause : remaining > 0 && remaining < session.minutes * 60_000 ? messages.resume : messages.start}
        </button>
        <button type="button" className={control} onClick={focus.reset}>{messages.reset}</button>
        {permission === "default" && (
          <button type="button" className={control} onClick={() => void focus.enableNotifications()}>{messages.enableNotifications}</button>
        )}
      </div>
      {permission === "granted" && <p className="text-ios-footnote text-ink-secondary">{messages.notificationsEnabled}</p>}
      {permission === "denied" && <p className="text-ios-footnote text-ink-secondary">{messages.notificationsDenied}</p>}
    </div>
  );
}

function CalendarSubscription({ token, isOnline, onSignIn }: { token: string | null; isOnline: boolean; onSignIn?: () => void }) {
  const [date, setDate] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function update(revoke: boolean): Promise<void> {
    if (!token || !isOnline || (!revoke && !date)) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      if (revoke) {
        await revokeCalendarSubscription(token);
        setUrl("");
        setFeedback(messages.revoked);
      } else {
        setUrl(await createCalendarSubscription(token, date));
      }
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) setExpired(true);
      setError(messages.calendarError);
    } finally {
      setBusy(false);
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void update(false);
  };

  return (
    <div className="space-y-3 px-4 pb-4 text-ios-subhead">
      {!token || expired ? (
        <>
          <p className="text-ink-secondary">{messages.signInNeeded}</p>
          <button type="button" className={control} onClick={onSignIn}>{messages.signIn}</button>
        </>
      ) : (
        <>
          <p className="text-ink-secondary">{messages.calendarHelp}</p>
          {!isOnline && <p role="status" className="text-ink-secondary">{messages.offline}</p>}
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-ink-secondary">
              {messages.lastClass}
              <input type="date" required value={date} onChange={(event) => setDate(event.target.value)}
                className={`${input} dark:[color-scheme:dark]`} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || !isOnline} className={control}>
                {url ? messages.renew : messages.subscribe}
              </button>
              <button type="button" disabled={busy || !isOnline} className={control} onClick={() => void update(true)}>
                {messages.revoke}
              </button>
            </div>
          </form>
        </>
      )}
      {busy && <p role="status">{messages.saving}</p>}
      {error && !expired && <p role="alert" className="text-status-urgent">{error}</p>}
      {url && (
        <>
          <p className="text-ink-secondary">{messages.privateLink}</p>
          <input aria-label={messages.calendarLink} value={url} readOnly className={input} />
          <button type="button" className={control} onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setFeedback(messages.copied);
            } catch { setFeedback(messages.copyManual); }
          }}>{messages.copy}</button>
        </>
      )}
      {feedback && <p role="status" className="text-ink-secondary">{feedback}</p>}
    </div>
  );
}

export function StudyTools({ token, isOnline, onSignIn }: { token: string | null; isOnline: boolean; onSignIn?: () => void }) {
  const heading = "interactive-surface flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-ios-body font-semibold";
  return (
    <section aria-label={messages.title} className="mb-4 space-y-2">
      <details className="rounded-2xl border border-subtle bg-surface-card">
        <summary className={heading}><Timer size={22} aria-hidden="true" className="text-brand-action" /> {messages.timer}</summary>
        <FocusTimer />
      </details>
      <details className="rounded-2xl border border-subtle bg-surface-card">
        <summary className={heading}><Calendar size={22} aria-hidden="true" className="text-brand-action" /> {messages.calendar}</summary>
        <CalendarSubscription key={token ?? "guest"} token={token} isOnline={isOnline} onSignIn={onSignIn} />
      </details>
    </section>
  );
}
