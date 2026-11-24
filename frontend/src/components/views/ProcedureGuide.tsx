"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowSquareOut, CaretRight } from "@phosphor-icons/react";

import catalog from "@/lib/messages/academic-procedures.es-PE.json";
import { procedureGuideMessages as messages } from "@/lib/messages/procedure-guide-messages";

interface ProcedureLink {
  label: string;
  url: string;
}

interface ProcedureStep {
  id: string;
  title: string;
  description: string;
  links: readonly ProcedureLink[];
}

export interface AcademicProcedure {
  id: string;
  title: string;
  summary: string;
  prerequisites: readonly string[];
  forms: readonly ProcedureLink[];
  sources: readonly ProcedureLink[];
  steps: readonly ProcedureStep[];
}

const procedures: readonly AcademicProcedure[] = catalog.procedures;
const rowClass = "interactive-surface flex min-h-[44px] w-full items-center gap-3 px-4 py-3 text-left text-ios-subhead";
const actionClass = "interactive-surface inline-flex min-h-[44px] items-center justify-center rounded-xl border border-control px-4 py-2 text-ios-subhead font-semibold text-brand-action";

function ProcedureLinks({ links }: { links: readonly ProcedureLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="divide-y divide-subtle">
      {links.map(({ label, url }) => (
        <li key={url}>
          <a
            className={`${rowClass} justify-between text-brand-action`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="min-w-0 break-words">{label}</span>
            <ArrowSquareOut aria-hidden="true" className="shrink-0" size={17} />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ProcedureGuide({
  isOnline,
  onBack,
  items = procedures,
}: {
  isOnline: boolean;
  onBack: () => void;
  items?: readonly AcademicProcedure[];
}) {
  const [selected, setSelected] = useState<AcademicProcedure | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const stepHeadingId = useId();
  const step = selected?.steps[stepIndex];

  useEffect(() => {
    heading.current?.focus();
  }, [selected, stepIndex]);

  function openProcedure(procedure: AcademicProcedure | null): void {
    setStepIndex(0);
    setSelected(procedure);
  }

  return (
    <section className="min-h-dvh w-full bg-canvas px-5 pt-6 pb-dock-content text-ink-primary">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <button
            type="button"
            onClick={selected ? () => openProcedure(null) : onBack}
            className="interactive-surface -ml-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-ios-subhead font-semibold text-brand-action"
          >
            <ArrowLeft aria-hidden="true" size={18} />
            {selected ? messages.backToGuides : messages.backToHugo}
          </button>
          <h1 tabIndex={selected ? undefined : -1} ref={selected ? undefined : heading}
              className="break-words text-ios-large-title font-extrabold tracking-tight">
            {selected?.title ?? messages.title}
          </h1>
        </header>

        {!isOnline && (
          <p role="status" className="rounded-xl bg-surface-inset px-4 py-3 text-ios-footnote text-ink-secondary">
            {messages.offline}
          </p>
        )}

        {!selected ? (
          items.length > 0 ? (
            <ul className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-card">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={rowClass} onClick={() => openProcedure(item)}>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold">{item.title}</span>
                      <span className="mt-0.5 block line-clamp-2 text-ios-footnote text-ink-secondary">{item.summary}</span>
                    </span>
                    <CaretRight aria-hidden="true" className="shrink-0 text-ink-muted" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-ios-subhead text-ink-secondary">{messages.empty}</p>
        ) : step && (
          <>
            <nav aria-label={messages.steps}>
              <ol className="flex flex-wrap gap-2">
                {selected.steps.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-label={item.title}
                      aria-current={index === stepIndex ? "step" : undefined}
                      onClick={() => setStepIndex(index)}
                      className={`interactive-surface flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border text-ios-subhead font-semibold ${index === stepIndex ? "border-control bg-surface-inset text-brand-action underline underline-offset-4" : "border-subtle bg-surface-card text-ink-secondary"}`}
                    >
                      {index + 1}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <section aria-labelledby={stepHeadingId} className="overflow-hidden rounded-2xl border border-subtle bg-surface-card">
              <div className="space-y-3 p-4">
                <p className="text-ios-footnote font-medium text-ink-secondary">
                  {messages.progress(stepIndex + 1, selected.steps.length)}
                </p>
                <h2 id={stepHeadingId} ref={heading} tabIndex={-1} className="break-words text-ios-title-2 font-bold">{step.title}</h2>
                <p className="break-words text-ios-subhead leading-relaxed text-ink-secondary">{step.description}</p>
                {step.id === "requirements" && selected.prerequisites.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-ios-subhead text-ink-primary">
                    {selected.prerequisites.map((item) => <li key={item} className="break-words">{item}</li>)}
                  </ul>
                )}
              </div>
              <ProcedureLinks links={step.id === "forms" ? [...step.links, ...selected.forms] : step.links} />
            </section>
            <div className="flex flex-wrap gap-2">
              {stepIndex > 0 && (
                <button type="button" className={actionClass} onClick={() => setStepIndex(stepIndex - 1)}>
                  {messages.previous}
                </button>
              )}
              {stepIndex < selected.steps.length - 1 ? (
                <button type="button" className={actionClass} onClick={() => setStepIndex(stepIndex + 1)}>
                  {messages.next}
                </button>
              ) : (
                <button type="button" className={actionClass} onClick={() => openProcedure(null)}>
                  {messages.finish}
                </button>
              )}
            </div>
            <details className="rounded-2xl border border-subtle bg-surface-card">
              <summary className="interactive-surface min-h-[44px] cursor-pointer rounded-xl px-4 py-3 text-ios-subhead font-semibold">
                {messages.sources}
              </summary>
              <ProcedureLinks links={selected.sources} />
            </details>
          </>
        )}
      </div>
    </section>
  );
}
