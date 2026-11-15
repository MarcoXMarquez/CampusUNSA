"use client";

import React, { useState } from "react";
import { taskSyncMessages as messages } from "@/lib/task-board-messages";

export interface TareasSyncViewProps {
  classroomConnected: boolean;
  moodleIcalConnected: boolean;
  onLinkClassroom: () => void;
  onSubscribeMoodleIcal: (url: string) => Promise<void>;
}

/**
 * First-time tasks synchronization screen aligned with Stitch screen
 * "CampusUNSA - Tareas (Sincronizacion)" (0274b0e070374eff9366fc9fa54b2bef).
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
  const progressPercent = syncedCount === 2 ? 100 : syncedCount === 1 ? 50 : 0;

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
    <div className="w-full min-h-dvh bg-black text-white select-none safe-areas">
      <div className="w-full max-w-md mx-auto px-5 pt-4 pb-28 space-y-5">
        <header className="pt-1 pb-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {messages.headerTitle}
          </h1>
        </header>

        {/* Proactive Sync Overview Card */}
        <section
          aria-label={messages.bannerTitle}
          className="rounded-2xl bg-[#121214] border border-neutral-800/80 p-4 shadow-sm"
        >
          <div className="flex items-center space-x-3.5 mb-3.5">
            <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden ring-1 ring-neutral-700/60 bg-neutral-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/onboarding/step-2-courses.webp"
                alt={messages.bannerMascotAlt}
                width={48}
                height={48}
                className="w-full h-full object-cover pointer-events-none"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold text-white tracking-tight leading-snug">
                {messages.bannerTitle}
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                {messages.bannerDescription}
              </p>
            </div>
          </div>

          <div className="bg-[#18181b] rounded-xl px-3 py-2 border border-neutral-800/60">
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-neutral-400 text-[11px] font-medium">
                {messages.connectionStatusLabel}
              </span>
              <span className="text-[11px] font-semibold text-neutral-300">
                {messages.connectionProgress(syncedCount)}
              </span>
            </div>
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#8B0000] h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </section>

        {/* Platform Sync Cards */}
        <section aria-label={messages.connectionStatusLabel} className="space-y-3.5">
          {/* Google Classroom Card */}
          <div className="rounded-2xl bg-[#121214] border border-neutral-800/80 p-4 transition">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <svg
                    aria-hidden="true"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect height="15" rx="2" strokeWidth="1.8" width="18" x="3" y="4" />
                    <circle cx="9" cy="11.5" r="1.5" strokeWidth="1.5" />
                    <path d="M15 11.5a2 2 0 100-4 2 2 0 000 4z" strokeWidth="1.5" />
                    <path
                      d="M6.5 16c0-1.5 1.5-2.5 3.5-2.5s3.5 1 3.5 2.5"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {messages.classroomTitle}
                  </h3>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full ${
                        classroomConnected ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    <span
                      className={`text-xs font-medium ${
                        classroomConnected ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {classroomConnected
                        ? messages.statusConnected
                        : messages.statusDisconnected}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-neutral-400 mt-3 mb-3.5 leading-relaxed">
              {messages.classroomDescription}
            </p>

            <button
              type="button"
              onClick={onLinkClassroom}
              disabled={classroomConnected}
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] disabled:bg-neutral-800 disabled:text-neutral-300 active:scale-[0.98] transition flex items-center justify-center space-x-2 text-xs font-semibold text-white shadow-sm cursor-pointer disabled:cursor-default"
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="currentColor"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="currentColor"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="currentColor"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="currentColor"
                />
              </svg>
              <span>
                {classroomConnected
                  ? messages.classroomConnectedButton
                  : messages.classroomConnectButton}
              </span>
            </button>
          </div>

          {/* DUTIC (Aula Virtual) Card */}
          <div className="rounded-2xl bg-[#121214] border border-neutral-800/80 p-4 transition">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-950/60 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                  <svg
                    aria-hidden="true"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 14l9-5-9-5-9 5 9 5z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {messages.duticTitle}
                  </h3>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full ${
                        moodleIcalConnected ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    <span
                      className={`text-xs font-medium ${
                        moodleIcalConnected ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {moodleIcalConnected
                        ? messages.statusConnected
                        : messages.statusDisconnected}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-neutral-400 mt-3 mb-3.5 leading-relaxed">
              {messages.duticDescription}
            </p>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={openIcalModal}
                className="flex-1 min-h-[44px] py-2.5 px-3 rounded-xl bg-[#222226] hover:bg-[#2b2b30] active:scale-[0.98] transition flex items-center justify-center space-x-2 text-xs font-semibold text-neutral-100 border border-neutral-700/60 cursor-pointer"
              >
                <svg
                  aria-hidden="true"
                  className="w-4 h-4 text-orange-400 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>
                  {moodleIcalConnected
                    ? messages.duticConnectedButton
                    : messages.duticConnectButton}
                </span>
              </button>

              <button
                type="button"
                aria-label={messages.duticHelpAriaLabel}
                title={messages.tutorialModalTitle}
                onClick={() => setTutorialModalOpen(true)}
                className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl bg-[#222226] hover:bg-[#2b2b30] text-neutral-400 hover:text-white border border-neutral-700/60 transition flex items-center justify-center cursor-pointer"
              >
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* DUTIC Moodle iCal Subscription Modal */}
      {icalModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={closeIcalModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dutic-ical-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#121214] border border-neutral-800 p-5 text-white shadow-2xl space-y-4"
          >
            <div>
              <h2 id="dutic-ical-modal-title" className="text-lg font-bold text-white">
                {messages.icalModalTitle}
              </h2>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                {messages.icalModalDescription}
              </p>
            </div>

            {icalError && (
              <div
                role="alert"
                className="rounded-xl bg-red-950/60 border border-red-500/30 px-3 py-2 text-xs text-red-300"
              >
                {icalError}
              </div>
            )}

            <form onSubmit={handleIcalSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="dutic-ical-url-input"
                  className="block text-xs font-medium text-neutral-300"
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
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-[#18181b] border border-neutral-700/80 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#8B0000]"
                />
              </div>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={closeIcalModal}
                  disabled={icalSubmitting}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#222226] hover:bg-[#2b2b30] text-xs font-semibold text-neutral-200 border border-neutral-700/60 cursor-pointer"
                >
                  {messages.icalCancelButton}
                </button>
                <button
                  type="submit"
                  disabled={icalSubmitting || !icalUrl.trim()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
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
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setTutorialModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dutic-tutorial-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#121214] border border-neutral-800 p-5 text-white shadow-2xl space-y-4"
          >
            <div>
              <h2
                id="dutic-tutorial-modal-title"
                className="text-lg font-bold text-white"
              >
                {messages.tutorialModalTitle}
              </h2>
              <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                {messages.tutorialModalPlaceholder}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setTutorialModalOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] text-xs font-semibold text-white cursor-pointer"
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
