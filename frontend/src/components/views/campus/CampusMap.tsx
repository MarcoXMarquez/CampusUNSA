"use client";

import React, { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import type { Map as LeafletMap } from "leaflet";
import { CAMPUSES, type CampusId, type MapSelection } from "@/lib/campus-directory";
import { campusMessages as messages } from "@/lib/messages/campus-messages";
import "leaflet/dist/leaflet.css";
import "./campus-map.css";

const campusIds: readonly CampusId[] = ["engineering", "biomedical", "social"];
type Leaflet = typeof import("leaflet");
type TooltipDirection = "top" | "bottom" | "left" | "right";

const campusLabels: Record<CampusId, TooltipDirection> = {
  engineering: "left",
  biomedical: "right",
  social: "bottom",
};

function addPin(
  library: Leaflet,
  map: LeafletMap,
  point: MapSelection["point"],
  label: string,
  kind: "campus" | "school",
  direction: TooltipDirection = "top",
) {
  const tooltip = document.createElement("span");
  tooltip.textContent = label;
  return library.marker([...point], {
    icon: library.divIcon({ className: `campus-map-pin campus-map-pin--${kind}`, iconSize: [44, 44] }),
    title: label,
    alt: label,
    keyboard: kind === "campus",
  }).addTo(map).bindTooltip(tooltip, { direction, permanent: kind === "campus" });
}

export function CampusMap({
  selected, onSelectCampus,
}: { selected: MapSelection | null; onSelectCampus: (id: CampusId) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [readyMap, setReadyMap] = useState<{ map: LeafletMap; library: Leaflet } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    void import("leaflet").then((library) => {
      if (disposed) return;
      map = library.map(element, { scrollWheelZoom: false, zoomControl: false, minZoom: 12, maxZoom: 19 });
      map.attributionControl.setPrefix(false);
      let hasTiles = false;
      timeout = setTimeout(() => setStatus(hasTiles ? "ready" : "error"), 12000);
      library.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>',
        maxZoom: 19,
      }).on("tileload", () => {
        hasTiles = true;
      }).on("load", () => {
        clearTimeout(timeout);
        setStatus(hasTiles ? "ready" : "error");
      }).addTo(map);
      for (const id of campusIds) {
        const campus = CAMPUSES[id];
        addPin(library, map, campus.point, campus.name, "campus", campusLabels[id]).on("click", () => onSelectCampus(id));
      }
      setReadyMap({ map, library });
    }).catch(() => {
      if (!disposed) setStatus("error");
    });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      map?.remove();
    };
  }, [attempt, onSelectCampus]);

  useEffect(() => {
    if (!readyMap) return;
    const { map, library } = readyMap;
    if (!selected) {
      map.fitBounds(campusIds.map((id) => [...CAMPUSES[id].point] as [number, number]), { padding: [28, 28] });
      return;
    }
    map.setView([...selected.point], 17, { animate: false });
    if (selected.campus && selected.point === CAMPUSES[selected.campus].point) return;
    const marker = addPin(library, map, selected.point, selected.label, "school");
    marker.openTooltip();
    return () => { marker.remove(); };
  }, [readyMap, selected]);

  return (
    <div className="campus-map relative isolate overflow-hidden rounded-2xl border border-subtle bg-surface-inset">
      <div ref={container} role="region" aria-label={messages.communityMap}
        className="h-72 w-full sm:h-96" />
      {readyMap && status === "ready" && (
        <div className="absolute bottom-7 right-3 z-[500] grid divide-y divide-subtle overflow-hidden rounded-xl border border-control bg-surface-card text-brand-action">
          <button type="button" aria-label={messages.zoomIn} onClick={() => readyMap.map.zoomIn()} className="interactive-surface grid h-11 w-11 place-items-center">
            <Plus size={20} aria-hidden="true" />
          </button>
          <button type="button" aria-label={messages.zoomOut} onClick={() => readyMap.map.zoomOut()} className="interactive-surface grid h-11 w-11 place-items-center">
            <Minus size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      {status !== "ready" && (
        <div className="absolute inset-0 z-[500] grid place-content-center gap-2 bg-surface-inset p-6 text-center">
          {status === "loading" ? (
            <div role="status" aria-label={messages.loading} className="w-40 animate-pulse space-y-3">
              <div className="h-4 w-full rounded bg-surface-elevated" />
              <div className="h-4 w-2/3 rounded bg-surface-elevated" />
            </div>
          ) : (
            <>
              <p role="alert" className="text-ios-subhead text-ink-secondary">{messages.mapError}</p>
              <button type="button" onClick={() => {
                setReadyMap(null);
                setStatus("loading");
                setAttempt((value) => value + 1);
              }} className="interactive-surface mx-auto min-h-11 rounded-lg px-3 font-semibold text-ios-subhead text-brand-action">
                {messages.retry}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
