"use client";

import React, { useState } from "react";
import { ChalkboardTeacher, GraduationCap } from "@phosphor-icons/react";
import { taskSyncMessages as messages } from "@/lib/messages/task-board-messages";

export interface TareasSyncViewProps {
  classroomConnected: boolean;
  moodleIcalConnected: boolean;
  onLinkClassroom: () => void;
  onSubscribeMoodleIcal: (url: string) => Promise<void>;
}

/**
 * First-time tasks synchronization screen aligned with Stitch screen
 * "CampusUNSA - Tareas (Conecta tus plataformas)" (94d259ffc1d14e25a870eabc509ce779).
 */
export function TareasSyncView({
  classroomConnected,
  moodleIcalConnected,
  onLinkClassroom,
  onSubscribeMoodleIcal,
}: TareasSyncViewProps): React.JSX.Element {
  const [icalModalOpen, setIcalModalOpen] = useState<boolean>(false);
  const [tutorialModalOpen, setTutorialModalOpen] = useState<boolean>(false);
  const [icalUrl, setIcalUrl] = useState<string>("");
  const [icalSubmitting, setIcalSubmitting] = useState<boolean>(false);
  const [icalError, setIcalError] = useState<string | null>(null);

  const syncedCount =
    (classroomConnected ? 1 : 0) + (moodleIcalConnected ? 1 : 0);

  const openIcalModal = () => {
    setIcalError(null);
    setIcalModalOpen(true);
  };

  const closeIcalModal = () => {
    if (icalSubmitting) return;
    setIcalError(null);
    setIcalModalOpen(false);
  };

  const handleIcalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedUrl = icalUrl.trim();
    if (!trimmedUrl) return;

    setIcalSubmitting(true);
    setIcalError(null);
    try {
      await onSubscribeMoodleIcal(trimmedUrl);
      setIcalUrl("");
      setIcalModalOpen(false);
    } catch (err: unknown) {
      setIcalError(
        err instanceof Error ? err.message : messages.icalErrorFallback
      );
    } finally {
      setIcalSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-dvh bg-canvas text-ink-primary select-none safe-areas">
      <div className="w-full max-w-md mx-auto px-5 pt-4 pb-dock-content flex flex-col gap-6">
        <header className="pt-1">
          <h1 className="text-ios-large-title font-extrabold tracking-tight text-ink-primary">
            {messages.headerTitle}
          </h1>
        </header>

        {/* Centered Hero Banner */}
        <section
          aria-label={messages.bannerTitle}
          className="flex flex-col items-center text-center pt-1 pb-1"
        >
          <div className="w-20 h-20 mb-5 rounded-2xl bg-surface-elevated p-1 flex items-center justify-center border border-subtle overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/onboarding/step-2-courses.webp"
              alt={messages.bannerMascotAlt}
              width={72}
              height={72}
              className="w-full h-full object-cover rounded-xl pointer-events-none"
            />
          </div>
          <h2 className="text-ink-primary font-bold text-ios-title-3 tracking-tight">
            {messages.bannerTitle}
          </h2>
          <p className="text-ink-secondary text-ios-subhead mt-2 leading-relaxed px-4 max-w-[300px]">
            {messages.bannerDescription}
          </p>
        </section>

        {/* Platforms List Section */}
        <section
          aria-label={messages.connectionStatusLabel}
          className="flex flex-col gap-2.5"
        >
          <div className="flex justify-between items-center px-1">
            <span className="text-ink-primary font-semibold text-ios-callout">
              {messages.connectionStatusLabel}
            </span>
            <span className="text-ink-secondary text-ios-caption-1 font-normal">
              {messages.connectionProgress(syncedCount)}
            </span>
          </div>

          <div className="bg-surface-card rounded-2xl border border-subtle divide-y divide-subtle overflow-hidden">
            {/* Item 1: Google Classroom */}
            <article className="p-4 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-elevated flex-shrink-0 flex items-center justify-center text-ink-secondary border border-subtle">
                    <ChalkboardTeacher size={20} weight="regular" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0 pr-1">
                    <h3 className="text-ink-primary font-semibold text-ios-subhead leading-snug">
                      {messages.classroomTitle}
                    </h3>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span
                        aria-hidden="true"
                        className={`w-1.5 h-1.5 rounded-full inline-block ${
                          classroomConnected ? "bg-status-success" : "bg-ink-muted"
                        }`}
                      />
                      <span
                        className={`text-ios-caption-1 font-normal ${
                          classroomConnected ? "text-status-success" : "text-ink-secondary"
                        }`}
                      >
                        {classroomConnected
                          ? messages.statusConnected
                          : messages.statusDisconnected}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLinkClassroom}
                  disabled={classroomConnected}
                  className="self-start shrink-0 min-h-[44px] px-4 py-2 rounded-full bg-brand-cta interactive-cta disabled:bg-surface-elevated disabled:text-ink-secondary text-white text-ios-caption-1 font-semibold tracking-wide transition-all duration-150 active:scale-95 cursor-pointer disabled:cursor-default"
                >
                  {classroomConnected
                    ? messages.classroomConnectedButton
                    : messages.classroomConnectButton}
                </button>
              </div>

              <p className="text-ink-secondary text-ios-caption-1 mt-2.5 pl-[54px] leading-relaxed">
                {messages.classroomDescription}
              </p>
            </article>

            {/* Item 2: DUTIC (Aula Virtual) */}
            <article className="p-4 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-elevated flex-shrink-0 flex items-center justify-center text-ink-secondary border border-subtle">
                    <GraduationCap size={20} weight="regular" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0 pr-1">
                    <h3 className="text-ink-primary font-semibold text-ios-subhead leading-snug">
                      {messages.duticTitle}
                    </h3>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span
                        aria-hidden="true"
                        className={`w-1.5 h-1.5 rounded-full inline-block ${
                          moodleIcalConnected ? "bg-status-success" : "bg-ink-muted"
                        }`}
                      />
                      <span
                        className={`text-ios-caption-1 font-normal ${
                          moodleIcalConnected ? "text-status-success" : "text-ink-secondary"
                        }`}
                      >
                        {moodleIcalConnected
                          ? messages.statusConnected
                          : messages.statusDisconnected}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openIcalModal}
                  className="self-start shrink-0 min-h-[44px] px-4 py-2 rounded-full bg-brand-cta interactive-cta text-white text-ios-caption-1 font-semibold tracking-wide transition-all duration-150 active:scale-95 cursor-pointer"
                >
                  {moodleIcalConnected
                    ? messages.duticConnectedButton
                    : messages.duticConnectButton}
                </button>
              </div>

              <div className="pl-[54px] mt-2.5 flex flex-col items-start">
                <p className="text-ink-secondary text-ios-caption-1 leading-relaxed">
                  {messages.duticDescription}
                </p>
                <button
                  type="button"
                  aria-label={messages.duticHelpAriaLabel}
                  onClick={() => setTutorialModalOpen(true)}
                  className="mt-1 min-h-[44px] inline-flex items-center text-left text-brand-action text-ios-caption-1 font-medium hover:underline tracking-tight cursor-pointer"
                >
                  {messages.duticHelpLink}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>

      {/* DUTIC Moodle iCal Subscription Modal */}
      {icalModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={closeIcalModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dutic-ical-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-surface-sheet border border-subtle p-5 text-ink-primary shadow-layer-overlay space-y-4"
          >
            <div>
              <h2 id="dutic-ical-modal-title" className="text-ios-headline font-bold text-ink-primary">
                {messages.icalModalTitle}
              </h2>
              <p className="text-ios-caption-1 text-ink-secondary mt-1 leading-relaxed">
                {messages.icalModalDescription}
              </p>
            </div>

            {icalError && (
              <div
                role="alert"
                className="rounded-xl bg-surface-urgent border border-urgent-edge px-3 py-2 text-ios-caption-1 text-status-urgent"
              >
                {icalError}
              </div>
            )}

            <form onSubmit={handleIcalSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="dutic-ical-url-input"
                  className="block text-ios-caption-1 font-medium text-ink-secondary"
                >
                  {messages.icalInputLabel}
                </label>
                <input
                  id="dutic-ical-url-input"
                  type="url"
                  required
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  placeholder={messages.icalInputPlaceholder}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-surface-elevated border border-control text-ios-subhead text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-action"
                />
              </div>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={closeIcalModal}
                  disabled={icalSubmitting}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-inset text-ios-caption-1 font-semibold text-ink-primary border border-subtle cursor-pointer"
                >
                  {messages.icalCancelButton}
                </button>
                <button
                  type="submit"
                  disabled={icalSubmitting || !icalUrl.trim()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-cta interactive-cta disabled:opacity-50 text-ios-caption-1 font-semibold text-white cursor-pointer"
                >
                  {icalSubmitting
                    ? messages.icalSubmittingButton
                    : messages.icalSubmitButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temporary Tutorial Modal */}
      {tutorialModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setTutorialModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dutic-tutorial-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-surface-sheet border border-subtle p-5 text-ink-primary shadow-layer-overlay space-y-4"
          >
            <div>
              <h2
                id="dutic-tutorial-modal-title"
                className="text-ios-headline font-bold text-ink-primary"
              >
                {messages.tutorialModalTitle}
              </h2>
              <p className="text-ios-subhead text-ink-secondary mt-2 leading-relaxed">
                {messages.tutorialModalPlaceholder}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setTutorialModalOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-cta interactive-cta text-ios-caption-1 font-semibold text-white cursor-pointer"
              >
                {messages.tutorialCloseButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
