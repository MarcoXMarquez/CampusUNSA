"use client";

import { ArrowLeft, ArrowSquareOut, BookOpen } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiRequestError, listRegulations, publishRegulation, queryRegulations, setRegulationStatus,
  type RegulationAnswer, type RegulationCategory, type RegulationDocument,
} from "@/lib/api-client";
import { regulationsMessages as m } from "@/lib/messages/regulations-messages";

const card = "space-y-3 rounded-2xl border border-subtle bg-surface-card p-4";
const field = "min-h-[44px] w-full min-w-0 rounded-xl border border-control bg-surface-inset px-3 py-2 text-ios-body text-ink-primary";
const button = "interactive-surface min-h-[44px] rounded-xl px-3 py-2 text-ios-subhead font-semibold text-brand-action disabled:opacity-50";
const primary = "interactive-cta min-h-[44px] rounded-xl bg-brand-cta px-4 py-2 text-ios-subhead font-semibold text-white disabled:opacity-50";

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return m.expired;
    if (error.status === 503) return m.unavailable;
    if (error.status === 409) return m.alreadyIndexed;
    if ([413, 415, 422].includes(error.status)) return m.invalidPdf;
  }
  return m.error;
}

function Skeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className={card + " motion-safe:animate-pulse"}>
      <div aria-hidden="true" className="h-4 w-2/3 rounded bg-surface-inset" />
      <div aria-hidden="true" className="h-3 w-1/2 rounded bg-surface-inset" />
    </div>
  );
}

function Publications({ token, isOnline, onSignIn }: { token: string; isOnline: boolean; onSignIn: () => void }) {
  const [documents, setDocuments] = useState<RegulationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!isOnline) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listRegulations(token, 0, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      setDocuments(rows);
      setOffset(rows.length);
      setMore(rows.length === 20);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(err));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [token, isOnline]);

  async function load(next = 0) {
    setLoading(true);
    setError(null);
    try {
      const rows = await listRegulations(token, next);
      setDocuments((old) => next ? [...old, ...rows.filter((row) => !old.some(({ id }) => id === row.id))] : rows);
      setOffset(next + rows.length);
      setMore(rows.length === 20 && next < 10000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const pdf = data.get("pdf");
    if (!(pdf instanceof File) || !pdf.size) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const row = await publishRegulation(token, {
        title: String(data.get("title")), resolution: String(data.get("resolution")),
        category: data.get("category") as RegulationCategory, source_url: String(data.get("sourceUrl")),
      }, pdf);
      setDocuments((old) => [row, ...old.filter(({ id }) => id !== row.id)]);
      setNotice(m.published);
      form.reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: RegulationDocument) {
    setBusy(true);
    setError(null);
    try {
      const updated = await setRegulationStatus(token, row.id, !row.active);
      setDocuments((old) => old.map((document) => document.id === updated.id ? updated : document));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={(event) => void submit(event)} className={card}>
        <h2 className="text-ios-headline font-semibold">{m.library}</h2>
        <fieldset disabled={busy || !isOnline} className="min-w-0 space-y-3">
          <label className="block text-ios-subhead">{m.publicationTitle}
            <input name="title" className={field} required minLength={5} maxLength={180} />
          </label>
          <label className="block text-ios-subhead">{m.resolution}
            <input name="resolution" className={field} required placeholder="0127-2020" pattern="[0-9]{1,6}-20[0-9]{2}" />
          </label>
          <label htmlFor="regulation-category" className="block text-ios-subhead">{m.category}</label>
          <select name="category" id="regulation-category" className={field}>
            {Object.entries(m.categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label className="block text-ios-subhead">{m.sourceUrl}
            <input name="sourceUrl" type="url" className={field} required maxLength={1000} />
          </label>
          <label className="block text-ios-subhead">{m.pdf}
            <input name="pdf" type="file" accept="application/pdf,.pdf" required className={field} />
          </label>
          <button className={primary} type="submit">{busy ? m.publishing : m.publish}</button>
        </fieldset>
      </form>
      {notice && <p role="status" className="text-ios-subhead text-status-success">{notice}</p>}
      {error && <div role="alert" className={card}>
        <p>{error}</p>
        <button type="button" className={button} disabled={!isOnline || busy || loading}
          onClick={error === m.expired ? onSignIn : () => void load()}>{error === m.expired ? m.signIn : m.retry}</button>
      </div>}
      {loading && isOnline && !documents.length && <Skeleton label={m.loadingDocuments} />}
      {!loading && !error && !documents.length && <p className="text-ios-subhead text-ink-secondary">{m.listEmpty}</p>}
      {documents.map((document) => <article key={document.id} className={card}>
        <h3 className="line-clamp-2 break-words font-semibold">{document.title}</h3>
        <p className="text-ios-footnote text-ink-secondary">
          {document.resolution} · {m.categories[document.category]} · {document.active ? m.active : m.inactive}
        </p>
        <button type="button" className={button} disabled={busy || !isOnline}
          onClick={() => void toggle(document)}>{document.active ? m.retire : m.restore}</button>
      </article>)}
      {more && <button type="button" className={button} disabled={!isOnline || loading}
        onClick={() => void load(offset)}>{m.more}</button>}
    </>
  );
}

interface RegulationsViewProps {
  token: string | null;
  staff: boolean;
  isOnline: boolean;
  onBack: () => void;
  onSignIn: () => void;
  onEscalate?: () => void;
}

export function RegulationsView({ token, staff, isOnline, onBack, onSignIn, onEscalate }: RegulationsViewProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<RegulationAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manage, setManage] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  async function ask() {
    if (!token || !isOnline || question.trim().length < 5) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await queryRegulations(token, question.trim()));
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      if (message === m.expired) setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-dvh bg-canvas px-5 pt-6 pb-dock-content text-ink-primary">
      <div className="mx-auto max-w-md space-y-4">
        <button type="button" onClick={onBack} className={button + " flex items-center gap-2 pl-0"}>
          <ArrowLeft aria-hidden="true" size={18} /> {m.back}
        </button>
        <h1 ref={heading} tabIndex={-1} className="text-ios-large-title font-extrabold tracking-tight">{m.title}</h1>
        {!isOnline && <p role="status" className="text-ios-footnote text-ink-secondary">{m.offline}</p>}
        {!token ? <div className={card}>
          <p>{m.signInRequired}</p><button type="button" className={button} disabled={!isOnline} onClick={onSignIn}>{m.signIn}</button>
        </div> : <>
          <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className={card}>
            <label htmlFor="regulation-question" className="block text-ios-subhead font-semibold">{m.question}</label>
            <textarea id="regulation-question" className={field} value={question}
              placeholder={m.placeholder} minLength={5} maxLength={500} rows={3}
              onChange={(event) => setQuestion(event.currentTarget.value)} required />
            <button className={primary} type="submit" disabled={loading || !isOnline || question.trim().length < 5}>{m.search}</button>
          </form>
          {loading && <Skeleton label={m.loading} />}
          {error && <div role="alert" className={card}>
            <p>{error}</p>
            <button type="button" className={button} disabled={!isOnline || loading}
              onClick={error === m.expired ? onSignIn : () => void ask()}>{error === m.expired ? m.signIn : m.retry}</button>
          </div>}
          {!result && !loading && !error && <p className="text-ios-subhead text-ink-secondary">{m.empty}</p>}
          {result?.status === "not_found" && <div className={card}>
            <p role="status">{m.notFound}</p>
            {result.offer_ticket && onEscalate && <button type="button" className={button} onClick={onEscalate}>{m.ticket}</button>}
          </div>}
          {result?.citation && <article className={card}>
            <h2 className="text-ios-headline font-semibold">{m.answer}</h2>
            <blockquote className="break-words text-ios-body">{result.answer}</blockquote>
            <p className="line-clamp-2 break-words text-ios-subhead font-semibold">{result.citation.title}</p>
            <p className="text-ios-footnote text-ink-secondary">
              {m.citation(result.citation.article, result.citation.resolution, result.citation.page)}
            </p>
            <a className={button + " inline-flex items-center gap-2"} target="_blank" rel="noreferrer"
              href={result.citation.source_url + "#page=" + result.citation.page}>
              <ArrowSquareOut size={18} aria-hidden="true" /> {m.officialSource}
            </a>
          </article>}
          {staff && <button type="button" className={button + " flex items-center gap-2"} aria-expanded={manage}
            onClick={() => setManage(!manage)}><BookOpen size={20} aria-hidden="true" /> {m.library}</button>}
          {staff && manage && <Publications token={token} isOnline={isOnline} onSignIn={onSignIn} />}
        </>}
      </div>
    </section>
  );
}
