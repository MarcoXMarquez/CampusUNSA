"use client";

import React, { useState } from "react";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import type {
  CourseScheduleBlock,
  CourseScheduleBlockInput,
} from "@/lib/api-client";
import { formatAcademicTitle } from "@/lib/text-format";
import { horarioMessages as messages, taskBoardMessages } from "@/lib/messages/task-board-messages";

const GROUP_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

interface EditableBlock {
  key: string;
  component_type: "TEORIA" | "LABORATORIO";
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string;
  pavilion: string;
}

function toEditableBlocks(blocks: CourseScheduleBlock[] | undefined): EditableBlock[] {
  return (blocks ?? []).map((b, idx) => ({
    key: b.id || `block-${idx}`,
    component_type: b.component_type === "LABORATORIO" ? "LABORATORIO" : "TEORIA",
    day_of_week: b.day_of_week,
    start_time: b.start_time,
    end_time: b.end_time,
    room: b.room ?? "",
    pavilion: b.pavilion ?? "",
  }));
}

export interface CourseScheduleEditModalProps {
  course: AcademicCourse;
  isOnline: boolean;
  onClose: () => void;
  onSaveSchedule?: (
    courseCode: string,
    payload: {
      theory_group: string | null;
      lab_group: string | null;
      blocks: CourseScheduleBlockInput[];
    }
  ) => Promise<void>;
  onLoadGroupSchedule?: (
    courseCode: string,
    theoryGroup: string | null,
    labGroup: string | null
  ) => Promise<CourseScheduleBlock[]>;
}

/**
 * Modal dialog allowing students to configure theory/lab groups and weekly schedule sessions.
 */
export function CourseScheduleEditModal({
  course,
  isOnline,
  onClose,
  onSaveSchedule,
  onLoadGroupSchedule,
}: CourseScheduleEditModalProps): React.JSX.Element {
  const [editTheoryGroup, setEditTheoryGroup] = useState<string>(course.theory_group ?? "");
  const [editLabGroup, setEditLabGroup] = useState<string>(course.lab_group ?? "");
  const [editBlocks, setEditBlocks] = useState<EditableBlock[]>(() =>
    toEditableBlocks(course.schedule_blocks)
  );
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState<boolean>(false);

  const handleGroupSelectionChange = async (
    nextTheory: string,
    nextLab: string
  ): Promise<void> => {
    setEditTheoryGroup(nextTheory);
    setEditLabGroup(nextLab);
    if (!course.course_code || !onLoadGroupSchedule || !isOnline) {
      return;
    }
    try {
      const shared = await onLoadGroupSchedule(
        course.course_code,
        nextTheory || null,
        nextLab || null
      );
      if (shared.length > 0) {
        setEditBlocks(toEditableBlocks(shared));
      }
    } catch {
      // Preserve existing draft blocks if shared lookup fails.
    }
  };

  const handleAddSession = (): void => {
    const defaultComp: "TEORIA" | "LABORATORIO" =
      editTheoryGroup || !editLabGroup ? "TEORIA" : "LABORATORIO";
    if (defaultComp === "TEORIA" && !editTheoryGroup) {
      setEditTheoryGroup("A");
    } else if (defaultComp === "LABORATORIO" && !editLabGroup) {
      setEditLabGroup("A");
    }
    setEditBlocks((prev) => [
      ...prev,
      {
        key: `draft-${Date.now()}-${prev.length}`,
        component_type: defaultComp,
        day_of_week: 1,
        start_time: "08:40",
        end_time: "10:20",
        room: "",
        pavilion: "",
      },
    ]);
    setEditorError(null);
  };

  const handleUpdateDraftBlock = (key: string, patch: Partial<EditableBlock>): void => {
    setEditBlocks((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveDraftBlock = (key: string): void => {
    setEditBlocks((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!course.course_code || !onSaveSchedule) {
      return;
    }
    if (!isOnline) {
      setEditorError(messages.offlineSaveBlocked);
      return;
    }

    const mappedBlocks: CourseScheduleBlockInput[] = [];
    for (const block of editBlocks) {
      const targetGroup =
        block.component_type === "TEORIA" ? editTheoryGroup : editLabGroup;
      if (!targetGroup) {
        setEditorError(messages.validationMissingGroup);
        return;
      }
      if (block.end_time <= block.start_time) {
        setEditorError(messages.validationInvalidTime);
        return;
      }
      mappedBlocks.push({
        component_type: block.component_type,
        group_code: targetGroup,
        day_of_week: block.day_of_week,
        start_time: block.start_time,
        end_time: block.end_time,
        room: block.room.trim() || null,
        pavilion: block.pavilion.trim() || null,
      });
    }

    setEditorSaving(true);
    setEditorError(null);
    try {
      await onSaveSchedule(course.course_code, {
        theory_group: editTheoryGroup || null,
        lab_group: editLabGroup || null,
        blocks: mappedBlocks,
      });
      onClose();
    } catch (err: unknown) {
      setEditorError(
        err instanceof Error ? err.message : taskBoardMessages.syncError
      );
    } finally {
      setEditorSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 dark:bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => !editorSaving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-editor-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl bg-surface-sheet border border-subtle p-5 text-ink-primary shadow-layer-overlay space-y-4"
      >
        <div>
          <h2 id="schedule-editor-title" className="text-ios-headline font-bold text-ink-primary">
            {messages.editorDialogTitle}
          </h2>
          <p className="text-ios-caption-1 text-ink-secondary mt-1 line-clamp-2">
            {formatAcademicTitle(course.name) || course.name}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-ios-caption-1 text-ink-secondary space-y-1">
              <span>{messages.theoryGroupLabel}</span>
              <select
                aria-label={messages.theoryGroupLabel}
                value={editTheoryGroup}
                onChange={(e) => {
                  void handleGroupSelectionChange(e.target.value, editLabGroup);
                }}
                className="w-full min-h-[44px] rounded-xl bg-surface-elevated border border-control px-3 text-ios-subhead text-ink-primary"
              >
                <option value="">{messages.noGroupOption}</option>
                {GROUP_OPTIONS.map((grp) => (
                  <option key={grp} value={grp}>
                    Grupo {grp}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-ios-caption-1 text-ink-secondary space-y-1">
              <span>{messages.labGroupLabel}</span>
              <select
                aria-label={messages.labGroupLabel}
                value={editLabGroup}
                onChange={(e) => {
                  void handleGroupSelectionChange(editTheoryGroup, e.target.value);
                }}
                className="w-full min-h-[44px] rounded-xl bg-surface-elevated border border-control px-3 text-ios-subhead text-ink-primary"
              >
                <option value="">{messages.noGroupOption}</option>
                {GROUP_OPTIONS.map((grp) => (
                  <option key={grp} value={grp}>
                    Grupo {grp}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-3">
            {editBlocks.map((block) => (
              <div
                key={block.key}
                className="rounded-xl bg-surface-card border border-subtle p-3 space-y-2.5"
              >
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label={messages.sessionComponentLabel}
                    value={block.component_type}
                    onChange={(e) =>
                      handleUpdateDraftBlock(block.key, {
                        component_type:
                          e.target.value === "LABORATORIO" ? "LABORATORIO" : "TEORIA",
                      })
                    }
                    className="min-h-[44px] rounded-lg bg-surface-elevated border border-control px-2.5 text-ios-caption-1 text-ink-primary"
                  >
                    <option value="TEORIA">Teoría</option>
                    <option value="LABORATORIO">Laboratorio</option>
                  </select>

                  <select
                    aria-label={messages.sessionDayLabel}
                    value={block.day_of_week}
                    onChange={(e) =>
                      handleUpdateDraftBlock(block.key, {
                        day_of_week: Number.parseInt(e.target.value, 10),
                      })
                    }
                    className="min-h-[44px] rounded-lg bg-surface-elevated border border-control px-2.5 text-ios-caption-1 text-ink-primary"
                  >
                    {DAY_OPTIONS.map((dayNum) => (
                      <option key={dayNum} value={dayNum}>
                        {messages.dayFullNames[dayNum]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-ios-caption-2 text-ink-secondary space-y-1">
                    <span>{messages.sessionStartLabel}</span>
                    <input
                      type="time"
                      aria-label={messages.sessionStartLabel}
                      value={block.start_time}
                      onChange={(e) =>
                        handleUpdateDraftBlock(block.key, {
                          start_time: e.target.value,
                        })
                      }
                      className="w-full min-h-[44px] rounded-lg bg-surface-elevated border border-control px-2.5 text-ios-caption-1 text-ink-primary"
                    />
                  </label>
                  <label className="text-ios-caption-2 text-ink-secondary space-y-1">
                    <span>{messages.sessionEndLabel}</span>
                    <input
                      type="time"
                      aria-label={messages.sessionEndLabel}
                      value={block.end_time}
                      onChange={(e) =>
                        handleUpdateDraftBlock(block.key, {
                          end_time: e.target.value,
                        })
                      }
                      className="w-full min-h-[44px] rounded-lg bg-surface-elevated border border-control px-2.5 text-ios-caption-1 text-ink-primary"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label={messages.sessionRoomLabel}
                      placeholder={messages.sessionRoomPlaceholder}
                      value={block.room}
                      onChange={(e) =>
                        handleUpdateDraftBlock(block.key, {
                          room: e.target.value,
                        })
                      }
                      className="flex-1 min-h-[44px] rounded-lg bg-surface-elevated border border-control px-2.5 text-ios-caption-1 text-ink-primary"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDraftBlock(block.key)}
                      className="min-h-[44px] px-3 rounded-lg border border-control text-ios-caption-1 text-ink-secondary hover:text-ink-primary cursor-pointer"
                    >
                      {messages.deleteSessionButton}
                    </button>
                  </div>
                  <input
                    type="text"
                    aria-label={messages.sessionPavilionLabel}
                    placeholder={messages.sessionPavilionPlaceholder}
                    value={block.pavilion}
                    onChange={(e) =>
                      handleUpdateDraftBlock(block.key, {
                        pavilion: e.target.value,
                      })
                    }
                    className="w-full min-h-[44px] rounded-lg bg-surface-elevated border border-control px-2.5 text-ios-caption-1 text-ink-primary"
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddSession}
              className="w-full min-h-[44px] rounded-xl border border-dashed border-control text-ios-caption-1 font-semibold text-ink-primary hover:bg-surface-elevated cursor-pointer"
            >
              {messages.addSessionButton}
            </button>
          </div>

          {editorError && (
            <p role="alert" className="text-ios-caption-1 text-status-urgent">
              {editorError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={editorSaving}
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-control text-ios-caption-1 font-semibold text-ink-primary hover:bg-surface-elevated cursor-pointer"
            >
              {messages.cancelButton}
            </button>
            <button
              type="submit"
              disabled={editorSaving}
              className="min-h-[44px] px-4 rounded-xl bg-brand-cta hover:bg-brand-cta-hover text-ios-caption-1 font-semibold text-white cursor-pointer disabled:opacity-60"
            >
              {editorSaving
                ? messages.savingScheduleButton
                : messages.saveScheduleButton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
