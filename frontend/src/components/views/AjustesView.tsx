"use client";

import { settingsMessages as messages } from "@/lib/messages/settings-messages";
import React, { useEffect, useState } from "react";
import {
  Navbar,
  BlockTitle,
  List,
  ListItem,
  Toggle,
  Dialog,
  DialogButton,
} from "konsta/react";
import {
  Trash,
  SignOut,
  User,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { WhatsAppSheet } from "@/components/sheets/WhatsAppSheet";
import {
  fetchMessagingOtpStatus,
  getUserDisplayName,
  type BackendHealthStatus,
  type OtpStatusResponse,
  type UserProfile,
} from "@/lib/api-client";
import { ServicesIntegrationsSection } from "./ajustes/ServicesIntegrationsSection";
import { AppearanceSettingsSection } from "./ajustes/AppearanceSettingsSection";
import { CampusLocationsSection } from "./ajustes/CampusLocationsSection";
import { SystemDiagnosticsSection } from "./ajustes/SystemDiagnosticsSection";

interface AjustesViewProps {
  user: UserProfile | null;
  token: string | null;
  isOnline?: boolean;
  backendHealth?: BackendHealthStatus | null;
  classroomConnected: boolean;
  classroomSyncStatus: string;
  moodleIcalConnected: boolean;
  moodleIcalSyncStatus: string;
  onLinkClassroom: () => void;
  onSubscribeMoodleIcal: (url: string) => Promise<void>;
  onClearTasks: () => Promise<void>;
  onClearCourses: () => Promise<void>;
  onLogout: () => void;
  onOpenLogin: () => void;
}

/**
 * Settings view (messages.title) managing institutional account, platform integrations, data reset, and diagnostics.
 */
export function AjustesView({
  user,
  token,
  isOnline = true,
  backendHealth = null,
  classroomConnected,
  classroomSyncStatus,
  moodleIcalConnected,
  moodleIcalSyncStatus,
  onLinkClassroom,
  onSubscribeMoodleIcal,
  onClearTasks,
  onClearCourses,
  onLogout,
  onOpenLogin,
}: AjustesViewProps): React.JSX.Element {
  const [whatsappSheetOpened, setWhatsappSheetOpened] = useState<boolean>(false);
  const [icalDialogOpened, setIcalDialogOpened] = useState<boolean>(false);
  const [icalUrl, setIcalUrl] = useState<string>("");
  const [showSandbox, setShowSandbox] = useState<boolean>(false);
  const [cleaningTasks, setCleaningTasks] = useState<boolean>(false);
  const [cleaningCourses, setCleaningCourses] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messagingStatus, setMessagingStatus] = useState<OtpStatusResponse | null>(
    null
  );

  useEffect(() => {
    if (!token || !isOnline) return;
    let active = true;
    void fetchMessagingOtpStatus(token)
      .then((status) => {
        if (active) setMessagingStatus(status);
      })
      .catch(() => {
        // Keep last known status when offline or unauthenticated
      });
    return () => {
      active = false;
    };
  }, [token, isOnline]);

  const anyMessagingConnected = Boolean(
    messagingStatus?.whatsapp_connected || messagingStatus?.telegram_connected
  );
  const connectedChannelsSummary = [
    messagingStatus?.whatsapp_connected ? "WhatsApp" : null,
    messagingStatus?.telegram_connected ? "Telegram" : null,
  ]
    .filter(Boolean)
    .join(" y ");

  const displayName = getUserDisplayName(user);
  const avatarInitial = displayName[0]?.toUpperCase() || "U";

  const showNotice = (message: string) => {
    setActionError(null);
    setActionMessage(message);
    setTimeout(() => setActionMessage(null), 3000);
  };

  const showError = (err: unknown, fallback: string) => {
    setActionMessage(null);
    setActionError(err instanceof Error ? err.message : fallback);
    setTimeout(() => setActionError(null), 4000);
  };

  const handleIcalSubmit = async () => {
    if (!icalUrl.trim()) return;
    try {
      await onSubscribeMoodleIcal(icalUrl.trim());
      setIcalDialogOpened(false);
      showNotice(messages.moodleSubscribed);
    } catch (err: unknown) {
      showError(err, messages.moodleError);
    }
  };

  const handleClearTasks = async () => {
    setCleaningTasks(true);
    try {
      await onClearTasks();
      showNotice(messages.tasksRemoved);
    } catch (err: unknown) {
      showError(err, messages.taskRemovalError);
    } finally {
      setCleaningTasks(false);
    }
  };

  const handleClearCourses = async () => {
    setCleaningCourses(true);
    try {
      await onClearCourses();
      showNotice(messages.coursesRemoved);
    } catch (err: unknown) {
      showError(err, messages.courseRemovalError);
    } finally {
      setCleaningCourses(false);
    }
  };

  return (
    <div className="pb-dock-content">
      <Navbar title={messages.title} large />

      {actionMessage && (
        <div
          role="status"
          className="mx-4 mt-2 mb-3 p-3 rounded-xl bg-surface-card border border-subtle text-ios-subhead text-ink-primary flex items-center gap-2"
        >
          <CheckCircle
            size={18}
            weight="regular"
            className="text-brand-action shrink-0"
          />
          <span>{actionMessage}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mx-4 mt-2 mb-3 p-3 rounded-xl bg-surface-card border border-urgent-edge text-ios-subhead text-status-urgent flex items-center gap-2"
        >
          <WarningCircle size={18} weight="regular" className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <BlockTitle>Cuenta Institucional</BlockTitle>
      <List strong inset className="my-0">
        {user ? (
          <ListItem
            title={displayName}
            subtitle={user.email}
            after={
              <span className="text-ios-subhead text-ink-secondary">
                Verificado
              </span>
            }
            media={
              user.profile?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.profile.avatar_url}
                  alt={messages.avatarAlt}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-surface-elevated text-ink-primary flex items-center justify-center font-bold">
                  {avatarInitial}
                </div>
              )
            }
          />
        ) : (
          <ListItem
            link
            chevron
            title={messages.signIn}
            subtitle={messages.institutionalAccess}
            media={
              <User size={22} weight="regular" className="text-brand-action" />
            }
            onClick={onOpenLogin}
          />
        )}
      </List>

      <ServicesIntegrationsSection
        anyMessagingConnected={anyMessagingConnected}
        connectedChannelsSummary={connectedChannelsSummary}
        classroomConnected={classroomConnected}
        classroomSyncStatus={classroomSyncStatus}
        moodleIcalConnected={moodleIcalConnected}
        moodleIcalSyncStatus={moodleIcalSyncStatus}
        onOpenMessagingSheet={() => setWhatsappSheetOpened(true)}
        onLinkClassroom={onLinkClassroom}
        onOpenIcalDialog={() => setIcalDialogOpened(true)}
      />

      <AppearanceSettingsSection />

      <BlockTitle>Pruebas y Depuración</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title={messages.sandbox}
          subtitle={messages.sandboxHint}
          after={
            <Toggle
              checked={showSandbox}
              onChange={() => setShowSandbox(!showSandbox)}
            />
          }
        />
        <ListItem
          link
          title={messages.removeTasks}
          subtitle={messages.removeTasksHint}
          after={
            cleaningTasks ? (
              <span className="text-ios-footnote text-ink-secondary">
                {messages.removing}
              </span>
            ) : undefined
          }
          media={
            <Trash size={22} weight="regular" className="text-status-urgent" />
          }
          onClick={handleClearTasks}
        />
        <ListItem
          link
          title={messages.removeCourses}
          subtitle={messages.removeCoursesHint}
          after={
            cleaningCourses ? (
              <span className="text-ios-footnote text-ink-secondary">
                {messages.removing}
              </span>
            ) : undefined
          }
          media={
            <Trash size={22} weight="regular" className="text-status-urgent" />
          }
          onClick={handleClearCourses}
        />
      </List>

      <CampusLocationsSection />

      <SystemDiagnosticsSection
        isOnline={isOnline}
        backendHealth={backendHealth}
      />

      {user && (
        <>
          <div className="h-4" />
          <List strong inset className="my-0">
            <ListItem
              link
              title={messages.signOut}
              media={
                <SignOut
                  size={22}
                  weight="regular"
                  className="text-status-urgent"
                />
              }
              onClick={onLogout}
              className="text-status-urgent"
            />
          </List>
        </>
      )}

      <div className="pt-6 pb-4 text-center">
        <p className="text-ios-footnote text-ink-secondary">
          {messages.version}
        </p>
      </div>

      <WhatsAppSheet
        opened={whatsappSheetOpened}
        onClose={() => setWhatsappSheetOpened(false)}
        token={token}
        isOnline={isOnline}
        initialStatus={messagingStatus}
        onStatusChange={setMessagingStatus}
      />

      <Dialog
        opened={icalDialogOpened}
        onBackdropClick={() => setIcalDialogOpened(false)}
        title={messages.moodleSubscription}
        buttons={
          <>
            <DialogButton onClick={() => setIcalDialogOpened(false)}>
              {messages.cancel}
            </DialogButton>
            <DialogButton strong onClick={handleIcalSubmit}>
              {messages.save}
            </DialogButton>
          </>
        }
      >
        <div className="py-2">
          <p className="text-ios-footnote text-ink-secondary mb-3">
            {messages.moodleUrlPrompt}
          </p>
          <input
            type="url"
            placeholder={messages.moodleUrlPlaceholder}
            value={icalUrl}
            onChange={(e) => setIcalUrl(e.target.value)}
            className="w-full px-3 py-2 text-ios-subhead rounded-lg border border-control bg-surface-card text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-action"
          />
        </div>
      </Dialog>
    </div>
  );
}
