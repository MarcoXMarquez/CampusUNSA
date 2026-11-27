"use client";

import Image from "next/image";
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { ArrowLeft, Package } from "@phosphor-icons/react";
import {
  ApiRequestError,
  LOST_FOUND_PAGE_SIZE,
  fetchLostItems,
  fetchMyLostClaims,
  lostItemPhotoUrl,
  reportLostItem,
  returnLostItem,
  reviewLostClaim,
  submitLostClaim,
  type LostClaim,
  type LostItem,
  type LostReportInput,
} from "@/lib/api-client";
import { lostFoundMessages as m } from "@/lib/messages/lost-found-messages";

type Screen = "catalog" | "claims" | "report";
type ClaimAction = "approve" | "reject" | "return";
type LostRow = LostItem | LostClaim;

const surface = "rounded-2xl border border-subtle bg-surface-card p-4";
const control = "w-full min-h-[44px] rounded-xl border border-control bg-surface-inset px-3 py-2 text-ios-body text-ink-primary";
const button = "interactive-surface min-h-[44px] rounded-xl px-3 py-2 text-ios-subhead font-semibold text-brand-action disabled:opacity-50";
const primary = "interactive-cta min-h-[44px] rounded-xl bg-brand-cta px-4 py-2 text-ios-subhead font-semibold text-white disabled:opacity-50";

function dataPart(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.includes(",")) {
        reject(new Error("Invalid image data"));
      } else {
        resolve(reader.result.split(",")[1]);
      }
    };
    reader.readAsDataURL(file);
  });
}

async function encodePhoto(file: File): Promise<string> {
  if (file.size <= 4 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return dataPart(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const source = document.createElement("img");
    source.src = url;
    await source.decode();
    const ratio = Math.min(1, 1600 / Math.max(source.naturalWidth, source.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not resize image");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function todayInLima(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

function dateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(isoDate));
}

function Field({ label, children, hint }: {
  label: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
  hint?: string;
}) {
  const id = useId();
  const hintId = hint ? id + "-hint" : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-ios-subhead font-semibold">{label}</label>
      {cloneElement(children, { id, "aria-describedby": hintId })}
      {hint && <p id={hintId} className="text-ios-footnote text-ink-secondary">{hint}</p>}
    </div>
  );
}

function ReportForm({
  disabled, onReport,
}: {
  disabled: boolean;
  onReport: (input: LostReportInput) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [reading, setReading] = useState(false);
  const selection = useRef(0);
  const requestId = useRef("");

  async function selectPhoto(file?: File) {
    const chosen = ++selection.current;
    setPhoto(null);
    setPhotoError(false);
    setReading(Boolean(file));
    if (!file) return;
    try {
      const base64 = await encodePhoto(file);
      if (selection.current === chosen) setPhoto(base64);
    } catch {
      if (selection.current === chosen) setPhotoError(true);
    } finally {
      if (selection.current === chosen) setReading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || disabled || reading) return;
    const fields = new FormData(event.currentTarget);
    const campus = fields.get("campus");
    if (campus !== "engineering" && campus !== "social" && campus !== "biomedical") return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    onReport({
      request_id: requestId.current,
      title: String(fields.get("title") ?? ""),
      description: String(fields.get("description") ?? ""),
      location: String(fields.get("location") ?? ""),
      campus,
      found_on: String(fields.get("date") ?? ""),
      photo_base64: photo,
    });
  }

  return (
    <form onSubmit={submit} className={surface}>
      <h2 className="text-ios-title-3 font-bold">{m.report}</h2>
      <fieldset disabled={disabled} className="mt-4 min-w-0 space-y-4">
        <Field label={m.titleField}>
          <input name="title" required minLength={3} maxLength={100} className={control} />
        </Field>
        <Field label={m.description}>
          <textarea name="description" required minLength={3} maxLength={500} rows={3} className={control} />
        </Field>
        <Field label={m.campus}>
          <select name="campus" required defaultValue="" className={control}>
            <option value="" disabled>{m.chooseCampus}</option>
            {Object.entries(m.campusNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field label={m.location}>
          <input name="location" required minLength={3} maxLength={160} className={control} />
        </Field>
        <Field label={m.foundOn}>
          <input name="date" type="date" required max={todayInLima()} defaultValue={todayInLima()} className={control} />
        </Field>
        <Field label={m.photo} hint={m.photoHint}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            required
            onChange={(event) => void selectPhoto(event.currentTarget.files?.[0])}
            className="block min-h-[44px] w-full min-w-0 rounded-xl border border-control bg-surface-inset text-ios-footnote text-ink-secondary file:mr-2 file:min-h-[44px] file:max-w-full file:cursor-pointer file:border-0 file:bg-surface-elevated file:px-3 file:font-semibold file:text-brand-action"
          />
        </Field>
        {photoError && <p role="alert" className="text-ios-footnote text-status-urgent">{m.photoError}</p>}
        <button type="submit" disabled={!photo || reading || disabled} className={primary}>{m.publish}</button>
      </fieldset>
    </form>
  );
}

function ItemCard({ item, onClaim, disabled }: { item: LostItem; onClaim: () => void; disabled: boolean }) {
  return (
    <article className={surface}>
      <div className="flex min-w-0 items-start gap-3">
        <a
          href={lostItemPhotoUrl(item.id)}
          target="_blank"
          rel="noreferrer"
          aria-label={m.fullPhoto + " · " + item.title}
          className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-inset"
        >
          <Image src={lostItemPhotoUrl(item.id, true)} alt={item.title} fill sizes="80px" unoptimized className="object-cover" />
        </a>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 break-words text-ios-headline font-semibold">{item.title}</h2>
          <p className="line-clamp-2 break-words text-ios-footnote text-ink-secondary">{item.location}</p>
          <p className="text-ios-footnote text-ink-secondary">
            {m.campusNames[item.campus]} · <time dateTime={item.found_on}>{dateLabel(item.found_on)}</time>
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 break-words text-ios-subhead">{item.description}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
        <span className="text-ios-footnote font-medium text-ink-secondary">{m.itemStatus[item.status]}</span>
        {item.status === "open" && (
          <button type="button" disabled={disabled} className={button} onClick={onClaim}>{m.claim}</button>
        )}
      </div>
    </article>
  );
}

function ClaimTextForm({
  kind, disabled, onCancel, onSubmit,
}: {
  kind: "proof" | "pickup";
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("message");
    if (!disabled && typeof text === "string") onSubmit(text);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={m[kind]} hint={kind === "proof" ? m.proofHint : m.pickupHint}>
        <textarea ref={input} name="message" required minLength={8} maxLength={500} rows={4} className={control} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={disabled} className={primary}>{kind === "proof" ? m.sendClaim : m.approve}</button>
        <button type="button" disabled={disabled} onClick={onCancel} className={button}>{m.cancel}</button>
      </div>
    </form>
  );
}

function ClaimCard({
  claim, disabled, onAction,
}: {
  claim: LostClaim;
  disabled: boolean;
  onAction: (action: ClaimAction, pickup?: string) => void;
}) {
  const [approvalOpen, setApprovalOpen] = useState(false);
  return (
    <article className={surface + " space-y-3"}>
      <header>
        <p className="text-ios-footnote text-ink-secondary">{claim.is_reporter ? m.sentToYou : m.sentByYou}</p>
        <h2 className="line-clamp-2 break-words text-ios-headline font-semibold">{claim.item_title}</h2>
        <p className="text-ios-footnote text-ink-secondary">
          {m.claimStatus[claim.status]} · {m.itemStatus[claim.item_status]}
        </p>
      </header>
      <dl className="space-y-2 text-ios-subhead">
        <div>
          <dt className="font-semibold">{m.proof}</dt>
          <dd className="whitespace-pre-wrap break-words">{claim.proof}</dd>
        </div>
        {claim.pickup && (
          <div>
            <dt className="font-semibold">{m.pickup}</dt>
            <dd className="whitespace-pre-wrap break-words">{claim.pickup}</dd>
          </div>
        )}
      </dl>
      {claim.is_reporter && claim.status === "pending" && (
        approvalOpen ? (
          <ClaimTextForm
            kind="pickup"
            disabled={disabled}
            onCancel={() => setApprovalOpen(false)}
            onSubmit={(pickup) => onAction("approve", pickup)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={disabled} onClick={() => setApprovalOpen(true)} className={primary}>{m.approve}</button>
            <button type="button" disabled={disabled} onClick={() => onAction("reject")} className={button}>{m.reject}</button>
          </div>
        )
      )}
      {claim.is_reporter && claim.status === "approved" && claim.item_status === "reserved" && (
        <button type="button" disabled={disabled} onClick={() => onAction("return")} className={primary}>{m.returnItem}</button>
      )}
    </article>
  );
}

function requestError(error: unknown): string {
  const status = error instanceof ApiRequestError ? error.status : undefined;
  if (status === 401) return m.sessionExpired;
  if (status === 403) return m.signInRequired;
  if (status === 409) return m.conflict;
  if (status === 413 || status === 422) return m.invalidInput;
  return m.unavailable;
}

function ListSkeleton() {
  return (
    <div role="status" aria-label={m.loading} className="space-y-3">
      {[0, 1, 2].map((key) => (
        <div key={key} aria-hidden="true" className={surface + " flex gap-3 motion-safe:animate-pulse"}>
          <div className="h-16 w-16 shrink-0 rounded-xl bg-surface-inset" />
          <div className="flex-1 space-y-2 py-2">
            <div className="h-3 w-2/3 rounded bg-surface-inset" />
            <div className="h-3 w-1/2 rounded bg-surface-inset" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LostFoundView({
  token, isOnline, onBack, onSignIn,
}: {
  token: string | null;
  isOnline: boolean;
  onBack: () => void;
  onSignIn: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("catalog");
  const [selected, setSelected] = useState<LostItem | null>(null);
  const [rows, setRows] = useState<LostRow[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [mutation, setMutation] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), []);

  useEffect(() => {
    const controller = new AbortController();
    const request = screen === "catalog"
      ? fetchLostItems(offset, controller.signal)
      : screen === "claims" && token && isOnline
        ? fetchMyLostClaims(token, offset, controller.signal)
        : null;
    if (!request) return;
    setPending(true);
    setLoadError(null);
    void request.then((page) => {
      if (controller.signal.aborted) return;
      setRows((previous) => offset === 0 ? page : [
        ...previous, ...page.filter((row) => !previous.some((existing) => existing.id === row.id)),
      ]);
      setHasLoaded(true);
      setHasMore(page.length === LOST_FOUND_PAGE_SIZE && offset + LOST_FOUND_PAGE_SIZE <= 10000);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        if (screen === "claims" && error instanceof ApiRequestError && [401, 403].includes(error.status)) {
          setRows([]);
          setHasMore(false);
          setLoadError(error.status === 401 ? m.sessionExpired : m.signInRequired);
        } else {
          setLoadError(m.syncError);
        }
      }
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false);
    });
    return () => controller.abort();
  }, [screen, token, offset, isOnline, revision]);

  function changeScreen(next: Screen) {
    setSelected(null);
    setActionError(null);
    if (next === screen) return;
    setRows([]);
    setHasLoaded(false);
    setHasMore(false);
    setLoadError(null);
    setPending(true);
    setOffset(0);
    setScreen(next);
  }

  async function mutate(action: (auth: string) => Promise<unknown>, success: string, next?: Screen) {
    if (!token || !isOnline || mutation) return;
    setMutation(true);
    setActionError(null);
    setNotice(null);
    try {
      await action(token);
      if (next) changeScreen(next);
      else setSelected(null);
      setOffset(0);
      setRevision((count) => count + 1);
      setNotice(success);
    } catch (error) {
      setActionError(requestError(error));
    } finally {
      setMutation(false);
    }
  }

  function claimAction(claim: LostClaim, action: ClaimAction, pickup?: string) {
    if (action === "return") {
      void mutate((auth) => returnLostItem(auth, claim.item_id), m.successfulReturn);
    } else {
      void mutate((auth) => reviewLostClaim(auth, claim.item_id, claim.id, {
        decision: action === "approve" ? "approved" : "rejected", pickup,
      }), m.successfulReview);
    }
  }

  const authNotice = (message: string) => (
    <div className={surface + " space-y-2"} role="status">
      <p className="text-ios-subhead text-ink-secondary">{message}</p>
      <button type="button" onClick={onSignIn} disabled={!isOnline} className={button}>{m.signIn}</button>
    </div>
  );
  const canSeeList = screen === "catalog" || (screen === "claims" && Boolean(token));
  const disabled = mutation || !isOnline;
  return (
    <section className="min-h-dvh bg-canvas px-5 pt-6 pb-dock-content text-ink-primary">
      <div className="mx-auto max-w-md space-y-4">
        <header>
          <button type="button" className={button + " flex items-center gap-2 pl-0"} onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={18} /> {m.back}
          </button>
          <h1 ref={heading} tabIndex={-1} className="text-ios-large-title font-extrabold tracking-tight outline-none">{m.title}</h1>
        </header>
        <div className="flex flex-wrap gap-1 rounded-2xl bg-surface-inset p-1">
          {(["catalog", "claims", "report"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              disabled={mutation}
              aria-pressed={screen === tab}
              onClick={() => { setNotice(null); changeScreen(tab); }}
              className={button + " flex-1 " + (screen === tab ? "bg-surface-card shadow-layer-segment" : "")}
            >
              {m[tab]}
            </button>
          ))}
        </div>
        {!isOnline && <p role="status" className="text-ios-footnote text-ink-secondary">{m.offline}</p>}
        {notice && <p role="status" className="text-ios-subhead text-status-success">{notice}</p>}
        {mutation && <p role="status" className="text-ios-footnote text-ink-secondary">{m.saving}</p>}
        {actionError && (actionError === m.sessionExpired
          ? authNotice(actionError)
          : <p role="alert" className="text-ios-subhead text-status-urgent">{actionError}</p>)}
        {screen !== "catalog" && !token && authNotice(m.signInRequired)}
        {screen === "report" && token && (
          <ReportForm disabled={disabled} onReport={(data) => void mutate((auth) => reportLostItem(auth, data), m.successfulReport, "catalog")} />
        )}
        {selected && (
          <div className={surface + " space-y-3"}>
            <h2 className="line-clamp-2 break-words text-ios-headline font-semibold">{selected.title}</h2>
            {token ? (
              <ClaimTextForm
                kind="proof"
                disabled={disabled}
                onCancel={() => { setSelected(null); setActionError(null); }}
                onSubmit={(proof) => void mutate((auth) => submitLostClaim(auth, selected.id, { proof }), m.successfulClaim, "claims")}
              />
            ) : authNotice(m.signInRequired)}
          </div>
        )}
        {canSeeList && (
          <>
            {pending && !hasLoaded && isOnline && <ListSkeleton />}
            {loadError && isOnline && ([m.sessionExpired, m.signInRequired].some((message) => message === loadError) ? authNotice(loadError) : (
              <div className={surface} role="alert">
                <p className="text-ios-subhead">{loadError}</p>
                <button type="button" className={button} onClick={() => setRevision((count) => count + 1)}>{m.retry}</button>
              </div>
            ))}
            {!rows.length && ((!pending && !loadError) || !isOnline) && (
              <div className={surface + " flex items-center gap-3 text-ios-subhead text-ink-secondary"}>
                <Package aria-hidden="true" size={22} className="shrink-0 text-brand-action" />
                {!hasLoaded && !isOnline ? m.offlineEmpty : screen === "catalog" ? m.emptyCatalog : m.emptyClaims}
              </div>
            )}
            <div className="space-y-3">
              {rows.map((row) => "proof" in row
                ? <ClaimCard key={row.id} claim={row} disabled={disabled} onAction={(action, pickup) => claimAction(row, action, pickup)} />
                : <ItemCard key={row.id} item={row} disabled={disabled} onClaim={() => { setSelected(row); setActionError(null); }} />)}
            </div>
            {hasMore && isOnline && !loadError && (
              <button type="button" className={button} disabled={disabled || pending} onClick={() => setOffset(offset + LOST_FOUND_PAGE_SIZE)}>
                {m.more}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
