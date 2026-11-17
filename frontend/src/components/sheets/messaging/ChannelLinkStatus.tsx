"use client";

import React from "react";
import { Preloader } from "konsta/react";
import {
  WhatsappLogo,
  PaperPlaneTilt,
  CheckCircle,
  LinkBreak,
} from "@phosphor-icons/react";
import type { MessagingChannel, OtpStatusResponse } from "@/lib/api-client";
import { MESSAGING_MESSAGES } from "@/lib/messages/messaging-messages";

function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed;
  const tail = trimmed.slice(-3);
  const prefix = trimmed.startsWith("+") ? "+" : "";
  const maskedCount = Math.max(trimmed.length - prefix.length - 3, 3);
  return `${prefix}${"*".repeat(maskedCount)}${tail}`;
}

export interface ChannelTabsProps {
  activeChannel: MessagingChannel;
  channelStatus: OtpStatusResponse | null;
  onSelectChannel: (channel: MessagingChannel) => void;
}

/**
 * Segmented channel selector switching between WhatsApp and Telegram pairing tabs.
 */
export function ChannelTabs({
  activeChannel,
  channelStatus,
  onSelectChannel,
}: ChannelTabsProps): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={MESSAGING_MESSAGES.headerTitle}
      className="mx-6 mt-4 p-1 rounded-xl bg-surface-inset grid grid-cols-2 gap-1"
    >
      {(["whatsapp", "telegram"] as const).map((channel) => {
        const selected = activeChannel === channel;
        const connected =
          channel === "whatsapp"
            ? channelStatus?.whatsapp_connected
            : channelStatus?.telegram_connected;
        return (
          <button
            key={channel}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelectChannel(channel)}
            className={`min-h-[44px] rounded-lg px-3 text-ios-footnote font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              selected
                ? "bg-surface-card text-ink-primary shadow-layer-segment"
                : "text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {channel === "whatsapp" ? (
              <WhatsappLogo size={17} weight="regular" aria-hidden="true" />
            ) : (
              <PaperPlaneTilt size={17} weight="regular" aria-hidden="true" />
            )}
            <span>{MESSAGING_MESSAGES.channelTabs[channel]}</span>
            {connected && (
              <CheckCircle
                size={15}
                weight="fill"
                className="text-status-success"
                aria-label={MESSAGING_MESSAGES.linkedBadge}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface ChannelLinkStatusProps {
  activeChannel: MessagingChannel;
  linkedIdentifier: string | null | undefined;
  unlinking: boolean;
  onUnlink: () => void;
}

/**
 * Linked messaging channel confirmation card with masked identifier and unlink control.
 */
export function ChannelLinkStatus({
  activeChannel,
  linkedIdentifier,
  unlinking,
  onUnlink,
}: ChannelLinkStatusProps): React.JSX.Element {
  return (
    <div className="py-2">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-status-success/15 flex items-center justify-center text-status-success">
        <CheckCircle size={28} weight="regular" aria-hidden="true" />
      </div>
      <h3 className="text-ios-title-3 font-semibold text-ink-primary mb-1">
        {MESSAGING_MESSAGES.linkedTitle[activeChannel]}
      </h3>
      {linkedIdentifier && (
        <p className="text-ios-subhead font-mono font-medium text-ink-secondary mb-2">
          {maskIdentifier(linkedIdentifier)}
        </p>
      )}
      <p className="text-ios-footnote text-ink-secondary mb-6 leading-relaxed">
        {MESSAGING_MESSAGES.linkedSubtitle}
      </p>
      <button
        type="button"
        disabled={unlinking}
        onClick={onUnlink}
        className="w-full min-h-[44px] rounded-xl border border-urgent-edge text-status-urgent text-ios-subhead font-semibold flex items-center justify-center gap-2 hover:bg-surface-urgent transition-colors disabled:opacity-50"
      >
        {unlinking ? (
          <Preloader size="w-4 h-4" />
        ) : (
          <LinkBreak size={18} weight="regular" aria-hidden="true" />
        )}
        <span>
          {unlinking
            ? MESSAGING_MESSAGES.unlinkingChannel
            : MESSAGING_MESSAGES.unlinkButton}
        </span>
      </button>
    </div>
  );
}
