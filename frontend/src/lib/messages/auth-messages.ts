export interface OnboardingSlide {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly ctaLabel: string;
}

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: 1,
    title: "CampusUNSA",
    description:
      "Tu espacio integral de bienestar universitario: gestiona tus cursos, salud estudiantil, actividades extracurriculares y vida en el campus en un solo lugar.",
    imageSrc: "/images/onboarding/step-1-welcome.webp",
    imageAlt: "Mascota pingüino estudiante UNSA dando la bienvenida",
    ctaLabel: "SIGUIENTE",
  },
  {
    id: 2,
    title: "Centraliza tus cursos y apuntes",
    description:
      "Accede al instante a Classroom, Aula Virtual y tus materiales académicos en una sola plataforma.",
    imageSrc: "/images/onboarding/step-2-courses.webp",
    imageAlt: "Estudiante pingüino repasando apuntes y libros universitarios",
    ctaLabel: "SIGUIENTE",
  },
  {
    id: 3,
    title: "Recordatorios y horarios al día",
    description:
      "No te pierdas ninguna entrega de tarea ni fecha de examen con notificaciones inteligentes sincronizadas.",
    imageSrc: "/images/onboarding/step-3-schedule.webp",
    imageAlt: "Mascota pingüino con campana de notificaciones y calendario",
    ctaLabel: "SIGUIENTE",
  },
  {
    id: 4,
    title: "¡Todo listo para empezar!",
    description:
      "Conéctate con tu cuenta institucional y lleva el control total de tu vida universitaria.",
    imageSrc: "/images/onboarding/step-4-ready.webp",
    imageAlt: "Mascota pingüino universitario listo para comenzar con su diploma",
    ctaLabel: "COMENZAR",
  },
] as const;

export const AUTH_MESSAGES = {
  welcomeBadge: "CAMPUS UNSA",
  welcomeTitle: "CampusUNSA",
  welcomeSubtitle:
    "Tu espacio integral de bienestar universitario: gestiona tus cursos, salud estudiantil, actividades extracurriculares y vida en el campus en un solo lugar.",
  welcomeNextButton: "SIGUIENTE",
  welcomeStartButton: "COMENZAR",
  skipButton: "Saltar",
  backButton: "Atrás",
  cancelButton: "Cancelar",
  signInGreeting: "¡Bienvenido de nuevo!",
  signUpGreeting: "Crea tu cuenta agustina",
  signInTitle: "Iniciar sesión",
  signUpTitle: "Crear cuenta",
  signInSubtitle: "Ingresa a tu portal académico para continuar",
  signUpSubtitle: "Regístrate usando tu correo institucional @unsa.edu.pe",
  fullNameLabel: "Nombre completo",
  fullNamePlaceholder: "Ej. Marco Márquez",
  emailLabel: "Correo institucional",
  emailPlaceholder: "usuario@unsa.edu.pe",
  passwordLabel: "Contraseña",
  passwordPlaceholder: "Ingresa tu contraseña",
  rememberMeLabel: "Recordarme",
  forgotPasswordLink: "¿Olvidaste tu contraseña?",
  signInSubmit: "Iniciar sesión",
  signUpSubmit: "Crear cuenta",
  submitting: "Procesando...",
  dividerText: "O continúa con",
  googleButton: "Continuar con Google",
  switchToSignUpPrompt: "¿No tienes una cuenta?",
  switchToSignUpAction: "Regístrate aquí",
  switchToSignInPrompt: "¿Ya tienes una cuenta?",
  switchToSignInAction: "Inicia sesión",
  missingFieldsError: "Completa tu correo institucional y contraseña.",
  invalidDomainError: "Usa exclusivamente tu correo institucional @unsa.edu.pe.",
  securityNotice: "Acceso Seguro UNSA · Exclusivo comunidad agustina",
} as const;
