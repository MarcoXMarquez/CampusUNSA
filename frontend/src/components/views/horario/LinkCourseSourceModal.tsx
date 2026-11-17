"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import type { CourseCatalogItem } from "@/lib/api-client";
import { formatAcademicTitle } from "@/lib/text-format";
import { horarioMessages as messages, taskBoardMessages } from "@/lib/messages/task-board-messages";

const GROUP_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;

export interface LinkCourseSourceModalProps {
  course: AcademicCourse;
  catalogCourses: CourseCatalogItem[];
  isOnline: boolean;
  onClose: () => void;
  onLoadCatalog?: (query?: string) => Promise<CourseCatalogItem[]>;
  onLinkPendingSource?: (
    sourceId: string,
    payload: {
      course_code: string;
      component_type: "TEORIA" | "LABORATORIO" | "UNICO";
      group_code: string | null;
    }
  ) => Promise<void>;
}

/**
 * Modal dialog allowing students to associate an unresolved Moodle/Classroom source with an UNSA catalog course.
 */
export function LinkCourseSourceModal({
  course,
  catalogCourses,
  isOnline,
  onClose,
  onLoadCatalog,
  onLinkPendingSource,
}: LinkCourseSourceModalProps): React.JSX.Element {
  const primarySource = course.sources?.[0];
  const [catalogItems, setCatalogItems] = useState<CourseCatalogItem[]>(catalogCourses);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [catalogQuery, setCatalogQuery] = useState<string>("");
  const [selectedCatalogCode, setSelectedCatalogCode] = useState<string>("");
  const [linkComponentType, setLinkComponentType] = useState<"TEORIA" | "LABORATORIO" | "UNICO">(
    primarySource?.component_type === "LABORATORIO"
      ? "LABORATORIO"
      : primarySource?.component_type === "UNICO"
        ? "UNICO"
        : "TEORIA"
  );
  const [linkGroupCode, setLinkGroupCode] = useState<string>(
    course.theory_group ?? course.lab_group ?? "A"
  );
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSaving, setLinkSaving] = useState<boolean>(false);

  useEffect(() => {
    if (catalogCourses.length > 0) {
      setCatalogItems(catalogCourses);
      return;
    }
    if (!onLoadCatalog || !isOnline) {
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    void onLoadCatalog()
      .then((fetched) => {
        if (!cancelled) {
          setCatalogItems(fetched);
        }
      })
      .catch(() => {
        // Empty state handles missing catalog.
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catalogCourses, isOnline, onLoadCatalog]);

  const filteredCatalog = useMemo(() => {
    const trimmed = catalogQuery.trim().toLowerCase();
    if (!trimmed) {
      return catalogItems.slice(0, 30);
    }
    return catalogItems
      .filter(
        (item) =>
          item.code.toLowerCase().includes(trimmed) ||
          item.official_name.toLowerCase().includes(trimmed) ||
          item.normalized_name.toLowerCase().includes(trimmed)
      )
      .slice(0, 30);
  }, [catalogItems, catalogQuery]);

  const handleConfirmLink = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!onLinkPendingSource) {
      return;
    }
    if (!selectedCatalogCode) {
      setLinkError(messages.selectCatalogError);
      return;
    }
    const sourceId = primarySource?.source_id ?? course.id;
    setLinkSaving(true);
    setLinkError(null);
    try {
      await onLinkPendingSource(sourceId, {
        course_code: selectedCatalogCode,
        component_type: linkComponentType,
        group_code: linkGroupCode || null,
      });
      onClose();
    } catch (err: unknown) {
      setLinkError(
        err instanceof Error ? err.message : taskBoardMessages.syncError
      );
    } finally {
      setLinkSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 dark:bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => !linkSaving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-link-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl bg-surface-sheet border border-subtle p-5 text-ink-primary shadow-layer-overlay space-y-4"
      >
        <div>
          <h2 id="pending-link-title" className="text-ios-headline font-bold text-ink-primary">
            {messages.linkDialogTitle}
          </h2>
          <p className="text-ios-caption-1 text-ink-secondary mt-1">
            {course.name}
          </p>
        </div>

        <form onSubmit={handleConfirmLink} className="space-y-3">
          <input
            type="search"
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            placeholder={messages.catalogSearchPlaceholder}
            className="w-full min-h-[44px] rounded-xl bg-surface-elevated border border-control px-3 text-ios-subhead text-ink-primary placeholder:text-ink-muted"
          />

          <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-xl bg-surface-card border border-subtle p-2">
            {catalogLoading ? (
              <p className="text-ios-caption-1 text-ink-secondary p-2">
                {messages.catalogLoading}
              </p>
            ) : filteredCatalog.length === 0 ? (
              <p className="text-ios-caption-1 text-ink-secondary p-2">
                {messages.catalogEmpty}
              </p>
            ) : (
              filteredCatalog.map((item) => {
                const selected = selectedCatalogCode === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setSelectedCatalogCode(item.code)}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-lg text-left text-ios-caption-1 transition cursor-pointer ${
                      selected
                        ? "bg-brand-cta text-white font-semibold"
                        : "text-ink-primary hover:bg-surface-elevated"
                    }`}
                  >
                    <span className="font-mono">{item.code}</span> ·{" "}
                    {formatAcademicTitle(item.official_name) || item.official_name} (
                    {item.curriculum_year})
                  </button>
                );
              })
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label={messages.sessionComponentLabel}
              value={linkComponentType}
              onChange={(e) => {
                const val = e.target.value;
                setLinkComponentType(
                  val === "LABORATORIO"
                    ? "LABORATORIO"
                    : val === "UNICO"
                      ? "UNICO"
                      : "TEORIA"
                );
              }}
              className="min-h-[44px] rounded-xl bg-surface-elevated border border-control px-3 text-ios-caption-1 text-ink-primary"
            >
              <option value="TEORIA">Teoría</option>
              <option value="LABORATORIO">Laboratorio</option>
              <option value="UNICO">Único</option>
            </select>

            <select
              aria-label="Grupo"
              value={linkGroupCode}
              onChange={(e) => setLinkGroupCode(e.target.value)}
              className="min-h-[44px] rounded-xl bg-surface-elevated border border-control px-3 text-ios-caption-1 text-ink-primary"
            >
              {GROUP_OPTIONS.map((grp) => (
                <option key={grp} value={grp}>
                  Grupo {grp}
                </option>
              ))}
            </select>
          </div>

          {linkError && (
            <p role="alert" className="text-ios-caption-1 text-status-urgent">
              {linkError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={linkSaving}
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-control text-ios-caption-1 font-semibold text-ink-primary hover:bg-surface-elevated cursor-pointer"
            >
              {messages.cancelButton}
            </button>
            <button
              type="submit"
              disabled={linkSaving}
              className="min-h-[44px] px-4 rounded-xl bg-brand-cta hover:bg-brand-cta-hover text-ios-caption-1 font-semibold text-white cursor-pointer disabled:opacity-60"
            >
              {linkSaving
                ? messages.linkingButton
                : messages.confirmLinkButton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
