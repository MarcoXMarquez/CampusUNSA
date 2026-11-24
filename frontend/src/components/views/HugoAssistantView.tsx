"use client";

import React, { useEffect, useRef, useState } from "react";
import { BookOpen, CaretRight, WhatsappLogo } from "@phosphor-icons/react";
import { WhatsAppSheet } from "@/components/sheets/WhatsAppSheet";
import { ProcedureGuide } from "@/components/views/ProcedureGuide";
import { procedureGuideMessages as guideMessages } from "@/lib/messages/procedure-guide-messages";
import { taskSyncMessages as syncMessages } from "@/lib/messages/task-board-messages";

export interface HugoAssistantViewProps {
  token: string | null;
  isOnline: boolean;
  sheetOpened: boolean;
  onOpenSheet: () => void;
  onCloseSheet: () => void;
}

/**
 * Hugo omnichannel assistant hub tab with pairing status launcher.
 */
export function HugoAssistantView({
  token,
  isOnline,
  sheetOpened,
  onOpenSheet,
  onCloseSheet,
}: HugoAssistantViewProps): React.JSX.Element {
  const [guideOpen, setGuideOpen] = useState(false);
  const guideLauncher = useRef<HTMLButtonElement>(null);
  const restoreLauncherFocus = useRef(false);

  useEffect(() => {
    if (!guideOpen && restoreLauncherFocus.current) {
      restoreLauncherFocus.current = false;
      guideLauncher.current?.focus();
    }
  }, [guideOpen]);

  if (guideOpen) {
    return <ProcedureGuide isOnline={isOnline} onBack={() => setGuideOpen(false)} />;
  }
  return (
    <section className="w-full min-h-dvh bg-canvas text-ink-primary px-5 pt-6 pb-dock-content">
      <div className="w-full max-w-md mx-auto space-y-5">
        <header className="pt-1">
          <h1 className="text-ios-large-title font-extrabold tracking-tight text-ink-primary">
            {syncMessages.hugoTitle}
          </h1>
        </header>
        <button
          ref={guideLauncher}
          type="button"
          aria-label={guideMessages.launcher}
          onClick={() => {
            restoreLauncherFocus.current = true;
            setGuideOpen(true);
          }}
          className="interactive-surface flex min-h-[44px] w-full items-center gap-3 rounded-2xl border border-subtle bg-surface-card p-4 text-left"
        >
          <BookOpen aria-hidden="true" className="shrink-0 text-brand-action" size={22} />
          <span className="min-w-0 flex-1">
            <span className="block text-ios-subhead font-semibold text-ink-primary">{guideMessages.title}</span>
            <span className="mt-0.5 block text-ios-footnote text-ink-secondary">{guideMessages.description}</span>
          </span>
          <CaretRight aria-hidden="true" className="shrink-0 text-ink-muted" size={16} />
        </button>
        <div className="rounded-2xl bg-surface-card border border-subtle p-5 space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-status-success/15 border border-status-success/25 flex items-center justify-center text-status-success shrink-0">
              <WhatsappLogo size={22} weight="regular" aria-hidden="true" />
            </div>
            <p className="text-ios-footnote text-ink-secondary leading-relaxed">
              {syncMessages.hugoDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSheet}
            className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-brand-cta interactive-cta active:scale-[0.98] transition flex items-center justify-center text-ios-caption-1 font-semibold text-white cursor-pointer"
          >
            {syncMessages.hugoActionButton}
          </button>
        </div>
      </div>
      <WhatsAppSheet
        opened={sheetOpened}
        onClose={onCloseSheet}
        token={token}
        isOnline={isOnline}
      />
    </section>
  );
}
