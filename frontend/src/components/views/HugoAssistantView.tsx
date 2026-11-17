"use client";

import React from "react";
import { WhatsappLogo } from "@phosphor-icons/react";
import { WhatsAppSheet } from "@/components/sheets/WhatsAppSheet";
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
  return (
    <section className="w-full min-h-dvh bg-canvas text-ink-primary px-5 pt-6 pb-dock-content">
      <div className="w-full max-w-md mx-auto space-y-5">
        <header className="pt-1">
          <h1 className="text-ios-large-title font-extrabold tracking-tight text-ink-primary">
            {syncMessages.hugoTitle}
          </h1>
        </header>
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
