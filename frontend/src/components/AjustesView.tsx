"use client";

import React, { useState } from "react";
import {
  Navbar,
  BlockTitle,
  List,
  ListItem,
  Toggle,
  Button,
  Dialog,
  DialogButton,
} from "konsta/react";
import {
  WhatsappLogo,
  GoogleLogo,
  CalendarCheck,
  Trash,
  SignOut,
  Buildings,
  Cpu,
  User,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { WhatsAppSheet } from "./WhatsAppSheet";

interface GoogleAuthProfile {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  profile?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface AjustesViewProps {
  user: GoogleAuthProfile | null;
  token: string | null;
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

export function AjustesView({
  user,
  token,
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

  const handleIcalSubmit = async () => {
    if (!icalUrl.trim()) return;
    await onSubscribeMoodleIcal(icalUrl);
    setIcalDialogOpened(false);
  };

  const handleClearTasks = async () => {
    setCleaningTasks(true);
    try {
      await onClearTasks();
      setActionMessage("Tareas borradas correctamente");
      setTimeout(() => setActionMessage(null), 3000);
    } finally {
      setCleaningTasks(false);
    }
  };

  const handleClearCourses = async () => {
    setCleaningCourses(true);
    try {
      await onClearCourses();
      setActionMessage("Cursos borrados correctamente");
      setTimeout(() => setActionMessage(null), 3000);
    } finally {
      setCleaningCourses(false);
    }
  };

  return (
    <div className="pb-24">
      <Navbar title="Ajustes" large />

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="mx-4 mt-2 mb-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle size={18} weight="regular" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* User Profile / Authentication Section */}
      <BlockTitle>Cuenta Institucional</BlockTitle>
      <List strong inset className="my-0">
        {user ? (
          <ListItem
            title={user.profile?.full_name || "Estudiante UNSA"}
            subtitle={user.email}
            after={
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-medium">
                Verificado
              </span>
            }
            media={
              user.profile?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.profile.avatar_url}
                  alt="Avatar"
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary-dark/20 text-primary dark:text-primary-dark flex items-center justify-center font-bold">
                  {user.profile?.full_name?.[0] || "U"}
                </div>
              )
            }
          />
        ) : (
          <ListItem
            link
            chevron
            title="Iniciar Sesión Institucional"
            subtitle="Acceso exclusivo con cuenta @unsa.edu.pe"
            media={<User size={22} weight="regular" className="text-primary dark:text-primary-dark" />}
            onClick={onOpenLogin}
          />
        )}
      </List>

      {/* Services & Integrations Section */}
      <BlockTitle>Servicios y Notificaciones</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          link
          chevron
          title="Asistente de WhatsApp"
          subtitle="Recordatorios automáticos en tu chat"
          after={
            <span className="text-[14px] text-black/50 dark:text-white/50">
              Vincular
            </span>
          }
          media={<WhatsappLogo size={22} weight="regular" className="text-emerald-500" />}
          onClick={() => setWhatsappSheetOpened(true)}
        />
        <ListItem
          link
          chevron
          title="Sincronizacion Google Classroom"
          subtitle={classroomConnected ? "Conectado · Sincronización activa" : "Vincular Google Classroom (1 Clic)"}
          after={
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                classroomConnected
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {classroomConnected ? "Conectado" : "No Vinculado"}
            </span>
          }
          media={<GoogleLogo size={22} weight="regular" className="text-blue-500" />}
          onClick={onLinkClassroom}
        />
        <ListItem
          link
          chevron
          title="Sincronizacion DUTIC Moodle"
          subtitle="Suscripcion de Calendario iCal Moodle (DUTIC)"
          after={
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                moodleIcalConnected
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {moodleIcalConnected ? "Suscrito" : "Configurar"}
            </span>
          }
          media={<CalendarCheck size={22} weight="regular" className="text-red-500" />}
          onClick={() => setIcalDialogOpened(true)}
        />
      </List>

      {/* Testing and Data Management Section */}
      <BlockTitle>Pruebas y Depuración</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title="Modo Sandbox / Opciones Avanzadas"
          subtitle="Habilita herramientas de desarrollo local"
          after={
            <Toggle
              checked={showSandbox}
              onChange={() => setShowSandbox(!showSandbox)}
            />
          }
        />
        <ListItem
          link
          title="Borrar Tareas"
          subtitle="Limpia la base de datos de actividades sincronizadas"
          after={
            cleaningTasks ? (
              <span className="text-xs text-black/40">Borrando...</span>
            ) : undefined
          }
          media={<Trash size={22} weight="regular" className="text-urgent dark:text-urgent-dark" />}
          onClick={handleClearTasks}
        />
        <ListItem
          link
          title="Borrar Cursos"
          subtitle="Limpia la lista de cursos sincronizados"
          after={
            cleaningCourses ? (
              <span className="text-xs text-black/40">Borrando...</span>
            ) : undefined
          }
          media={<Trash size={22} weight="regular" className="text-urgent dark:text-urgent-dark" />}
          onClick={handleClearCourses}
        />
      </List>

      {/* Campus Locations Section */}
      <BlockTitle>Sedes Universitarias Conectadas</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title="Campus Ingenierias"
          subtitle="Sistemas, Civil, Minas, Industrial"
          after={<span className="text-xs text-black/40">Paucarpata</span>}
          media={<Buildings size={22} weight="regular" className="text-black/60 dark:text-white/60" />}
        />
        <ListItem
          title="Campus Biomedicas"
          subtitle="Medicina, Enfermería, Biología"
          after={<span className="text-xs text-black/40">A. Carrión</span>}
          media={<Buildings size={22} weight="regular" className="text-black/60 dark:text-white/60" />}
        />
        <ListItem
          title="Campus Sociales"
          subtitle="Derecho, Economía, Administración"
          after={<span className="text-xs text-black/40">Venezuela</span>}
          media={<Buildings size={22} weight="regular" className="text-black/60 dark:text-white/60" />}
        />
      </List>

      {/* Core Infrastructure Health Section */}
      <BlockTitle>Estado de Componentes Core (Infraestructura Docker)</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title="FastAPI Core"
          subtitle="Puerto 8000"
          after={<span className="text-xs text-emerald-600 font-semibold">Online</span>}
          media={<Cpu size={22} weight="regular" className="text-black/60 dark:text-white/60" />}
        />
        <ListItem
          title="PostgreSQL 16"
          subtitle="Puerto 5432"
          after={<span className="text-xs text-emerald-600 font-semibold">Ready</span>}
          media={<Cpu size={22} weight="regular" className="text-black/60 dark:text-white/60" />}
        />
        <ListItem
          title="Redis 7 Store"
          subtitle="Puerto 6379"
          after={<span className="text-xs text-emerald-600 font-semibold">Ready</span>}
          media={<Cpu size={22} weight="regular" className="text-black/60 dark:text-white/60" />}
        />
        <ListItem
          title="Evolution API"
          subtitle="Puerto 8080"
          after={<span className="text-xs text-slate-500 font-semibold">Standby</span>}
          media={<Cpu size={22} weight="regular" className="text-black/60 dark:text-white/60" />}
        />
      </List>

      {/* Logout / Session Section */}
      {user && (
        <>
          <div className="h-4" />
          <List strong inset className="my-0">
            <ListItem
              link
              title="Cerrar Sesión"
              media={<SignOut size={22} weight="regular" className="text-urgent dark:text-urgent-dark" />}
              onClick={onLogout}
              className="text-urgent dark:text-urgent-dark"
            />
          </List>
        </>
      )}

      {/* App Version Footnote */}
      <div className="pt-6 pb-4 text-center">
        <p className="text-[13px] text-black/40 dark:text-white/40">
          CampusUNSA Mobile PWA · v1.0.0
        </p>
      </div>

      {/* WhatsApp Pairing Sheet */}
      <WhatsAppSheet
        opened={whatsappSheetOpened}
        onClose={() => setWhatsappSheetOpened(false)}
        token={token}
      />

      {/* Moodle iCal Dialog */}
      <Dialog
        opened={icalDialogOpened}
        onBackdropClick={() => setIcalDialogOpened(false)}
        title="Suscripción iCal DUTIC"
        buttons={
          <>
            <DialogButton onClick={() => setIcalDialogOpened(false)}>
              Cancelar
            </DialogButton>
            <DialogButton strong onClick={handleIcalSubmit}>
              Guardar
            </DialogButton>
          </>
        }
      >
        <div className="py-2">
          <p className="text-[13px] text-black/70 dark:text-white/70 mb-3">
            Pega tu URL de exportación de calendario de Moodle DUTIC:
          </p>
          <input
            type="url"
            placeholder="https://aulavirtual.unsa.edu.pe/..."
            value={icalUrl}
            onChange={(e) => setIcalUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-zinc-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </Dialog>
    </div>
  );
}
