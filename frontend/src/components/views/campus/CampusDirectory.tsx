"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, MagnifyingGlass, MapPin, X } from "@phosphor-icons/react";
import { CAMPUSES, SCHOOLS, type CampusId, type MapSelection, type School } from "@/lib/campus-directory";
import { campusMessages as messages } from "@/lib/messages/campus-messages";
import { CampusMap } from "./CampusMap";

const campuses: readonly CampusId[] = ["engineering", "biomedical", "social"];

function searchable(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE");
}

const schoolIndex = SCHOOLS.map((school) => ({
  school,
  text: searchable([school.name, school.faculty, school.aliases].join(" ")),
}));

export function CampusDirectory({ isOnline, onBack }: { isOnline: boolean; onBack: () => void }) {
  const [filter, setFilter] = useState<CampusId | null>(null);
  const [query, setQuery] = useState("");
  const [school, setSchool] = useState<School | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const mapSection = useRef<HTMLElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const selectCampus = useCallback((campus: CampusId | null) => {
    setFilter(campus);
    setSchool(null);
  }, []);

  const chooseSchool = (next: School) => {
    setSchool(next);
    mapSection.current?.scrollIntoView?.({ block: "start" });
  };

  const campus = school ? school.campus : filter;
  const campusInfo = campus ? CAMPUSES[campus] : null;
  const target = useMemo<MapSelection | null>(() => {
    const point = school?.point ?? campusInfo?.point;
    const label = school?.name ?? campusInfo?.name;
    return point && label ? { point, label, campus: campus ?? undefined } : null;
  }, [campus, campusInfo, school]);

  const words = searchable(query).split(/\s+/).filter(Boolean);
  const results = schoolIndex.filter(({ school: entry, text }) =>
    (!filter || entry.campus === filter) && words.every((word) => text.includes(word))
  );

  return (
    <div className="safe-areas mx-auto min-h-dvh w-full max-w-5xl bg-canvas px-5 pb-dock-content pt-5 text-ink-primary">
      <button type="button" onClick={onBack}
        className="interactive-surface -ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-ios-body text-brand-action">
        <CaretLeft size={19} aria-hidden="true" />
        {messages.back}
      </button>
      <h1 ref={heading} tabIndex={-1} className="mb-5 text-ios-large-title font-extrabold tracking-tight outline-none">
        {messages.title}
      </h1>

      <div role="group" aria-label={messages.filter} className="mb-4 flex flex-wrap gap-2">
        {([null, ...campuses] as const).map((id) => (
          <button key={id ?? "all"} type="button" aria-pressed={id === filter} onClick={() => selectCampus(id)}
            className={`interactive-surface min-h-11 rounded-xl border px-2.5 text-ios-footnote font-semibold ${
              id === filter ? "border-control bg-brand-tint/10 text-brand-action" : "border-subtle bg-surface-card text-ink-primary"
            }`}>
            {id ? CAMPUSES[id].name : messages.all}
          </button>
        ))}
      </div>

      <label htmlFor="school-search" className="sr-only">{messages.search}</label>
      <div className="mb-4 flex min-h-12 items-center gap-2 rounded-xl border border-control bg-surface-card pl-3 focus-within:ring-2 focus-within:ring-brand-action">
        <MagnifyingGlass aria-hidden="true" className="shrink-0 text-ink-secondary" size={20} />
        <input ref={searchInput} id="school-search" type="search" value={query}
          placeholder={messages.placeholder} onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          className="min-h-12 w-full min-w-0 appearance-none bg-transparent text-ios-body text-ink-primary outline-none placeholder:text-ink-secondary [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button type="button" aria-label={messages.clear} onClick={() => {
            setQuery("");
            searchInput.current?.focus();
          }} className="interactive-surface grid min-h-11 min-w-11 place-items-center rounded-xl text-ink-secondary">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section ref={mapSection} aria-label={messages.location} className="scroll-mt-5 lg:sticky lg:top-5">
          {(school || campusInfo) && (
            <div aria-live="polite" className="mb-3 flex gap-3 rounded-2xl border border-subtle bg-surface-card p-4">
              <MapPin size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-action" />
              <div className="min-w-0">
                <h2 className="text-ios-headline font-semibold">{school?.name ?? campusInfo?.name}</h2>
                {school && (
                  <p className="text-ios-footnote text-ink-secondary">
                    {campusInfo?.name ?? messages.otherLocation}
                  </p>
                )}
                <p className="mt-1 break-words text-ios-subhead text-ink-primary">{school?.address ?? campusInfo?.address}</p>
                {school && (
                  <p className="mt-1 text-ios-caption-1 text-ink-secondary">
                    {!school.point && campusInfo ? messages.campusReference : messages.addressReference}
                  </p>
                )}
              </div>
            </div>
          )}
          {isOnline ? (
            <CampusMap selected={target} onSelectCampus={selectCampus} />
          ) : (
            <p role="status" className="rounded-2xl border border-subtle bg-surface-card px-4 py-3 text-ios-subhead text-ink-secondary">
              {messages.offline}
            </p>
          )}
          <a href="https://www.unsa.edu.pe/defensoria-universitaria/guia-digital/"
            target="_blank" rel="noreferrer"
            className="interactive-surface mt-1 inline-flex min-h-11 items-center rounded-lg text-ios-footnote font-semibold text-brand-action">
            {messages.officialDirectory}
          </a>
        </section>

        <section aria-labelledby="school-results">
          <h2 id="school-results" className="mb-2 text-ios-headline font-semibold">{messages.results}</h2>
          {results.length > 0 ? (
            <ul className="divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-card">
              {results.map(({ school: entry }) => (
                <li key={entry.id}>
                  <button type="button" aria-pressed={school?.id === entry.id} onClick={() => chooseSchool(entry)}
                    className="interactive-surface flex min-h-11 w-full min-w-0 items-center gap-3 px-4 py-3 text-left aria-pressed:bg-brand-tint/10">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-ios-body font-semibold">{entry.name}</span>
                      <span className="mt-0.5 block line-clamp-2 text-ios-footnote text-ink-secondary">{entry.address}</span>
                    </span>
                    <MapPin size={18} aria-hidden="true" className="shrink-0 text-brand-action" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="rounded-2xl border border-subtle bg-surface-card p-4 text-ios-subhead text-ink-secondary">
              {messages.empty}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
