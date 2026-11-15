import type { MessagingChannel } from "../api-client";

export const MESSAGING_MESSAGES = {
  headerTitle: "Asistente de Mensajería",
  cancelButton: "Cancelar",
  doneButton: "Listo",
  offlineNotice: "Sin conexión · mostrando último estado",
  loadingCode: "Generando código seguro...",
  verifyingCode: "Verificando código...",
  unlinkingChannel: "Desvinculando canal...",
  channelTabs: {
    whatsapp: "WhatsApp",
    telegram: "Telegram",
  } satisfies Record<MessagingChannel, string>,
  channelInstructions: {
    whatsapp:
      "Envía este código de 6 dígitos al bot oficial de CampusUNSA por WhatsApp o ingresa tu número para vincularlo.",
    telegram:
      "Abre el bot oficial en Telegram para vincular tu chat en un toque o confirma el código manualmente.",
  } satisfies Record<MessagingChannel, string>,
  otpSectionLabel: "Código OTP de un solo uso",
  otpInputAriaLabel: "Código OTP de 6 dígitos",
  deepLinkLabel: {
    whatsapp: "Enviar código por WhatsApp",
    telegram: "Abrir bot en Telegram",
  } satisfies Record<MessagingChannel, string>,
  fallbackBotLabel: "Bot oficial CampusUNSA",
  copyCodeButton: "Copiar código",
  copiedCodeFeedback: "Código copiado",
  expiresPrefix: "El código expira en",
  expiredNotice: "El código expiró. Genera uno nuevo para continuar.",
  linkedBadge: "Vinculado",
  linkedTitle: {
    whatsapp: "WhatsApp vinculado",
    telegram: "Telegram vinculado",
  } satisfies Record<MessagingChannel, string>,
  linkedSubtitle:
    "Recibirás recordatorios automáticos de tareas, horarios y evaluaciones en este chat.",
  unlinkButton: "Desvincular canal",
  manualSectionTitle: "Confirmación manual",
  identifierLabel: {
    whatsapp: "Número de WhatsApp (ej. +51951222333)",
    telegram: "ID de chat de Telegram",
  } satisfies Record<MessagingChannel, string>,
  identifierPlaceholder: {
    whatsapp: "+51951222333",
    telegram: "Ej. 987654321",
  } satisfies Record<MessagingChannel, string>,
  manualVerifyButton: "Verificar y vincular",
  regenerateButton: "Generar nuevo código",
  resendCooldownPrefix: "Nuevo código en",
  authRequiredError: "Inicia sesión institucional para vincular tu canal.",
  genericError: "No se pudo completar la operación. Intenta nuevamente.",
  settingsRowTitle: "Asistente de WhatsApp",
  settingsRowSubtitleDefault: "WhatsApp y Telegram para recordatorios",
  settingsRowActionLink: "Vincular",
  settingsRowActionConnected: "Conectado",
} as const;
