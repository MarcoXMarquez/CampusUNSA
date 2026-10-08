# Plan Maestro de Planificacion Agil y GitHub Projects: CampusUNSA (Secretario Jorge)

> Asignatura: Gestion de Proyectos de Software — Universidad Nacional de San Agustin (UNSA)  
> Fecha de Inicio: Miercoles, 7 de octubre de 2026  
> Fecha de Cierre: Lunes, 7 de diciembre de 2026  
> Cadencia Agil: Sprints semanales (1 semana de duracion) con demostraciones cada Miercoles  
> Repositorio Oficial: https://github.com/MarcoXMarquez/CampusUNSA  
> Tablero de Proyecto: CampusUNSA - Product Backlog & Board  

---

## 1. Equipo de Desarrollo y Roles

| Integrante | Usuario GitHub | Rol Principal | Especialidad Tecnica |
| :--- | :--- | :--- | :--- |
| Marco Antonio Marquez Herrera | @MarcoXMarquez | Tech Lead & Backend / IA Lead | FastAPI, Ollama (RAG), PostgreSQL / pgvector |
| Alejandro Sebastian Alfonso Huacasi | @Sebastianzzzin | Fullstack & Mensajeria / DevOps Lead | Evolution API (Baileys), n8n Community, Docker |
| Italo Frankdux Ccoscco Alvis | @iccoscco | Frontend Web Lead & UI/UX Lead | React, Vite, Tailwind CSS, Responsive Design |
| Chambilla Perca Ricardo Mauricio | @rikich3 | Mobile Developer Lead & QA Lead | Android Nativo (Kotlin), Room, Pruebas de Calidad |

---

## 2. Definicion del Producto Minimo Viable (PMV / MVP)

El sistema resuelve la ineficiencia en la orientacion universitaria presencial reduciendo el tiempo de atencion de 40 minutos a 2 minutos mediante atencion 24/7 en WhatsApp, Telegram, Portal Web y App Android, respaldada por inferencia local con Ollama y derivacion a Secretaria.

---

## 3. Catalogo de Backlog Consolidado (21 Issues de Ingenieria)

| # | Titulo del Issue | Sprint | Fechas | Asignado(s) | Prioridad |
| :-: | :--- | :---: | :---: | :--- | :---: |
| #1 | [DevOps] Infraestructura local Docker (PostgreSQL + pgvector, n8n y Evolution API) | Sprint 1 | 07/10 - 14/10 | @MarcoXMarquez, @Sebastianzzzin | Must Have |
| #2 | [Arquitectura] Contratos C4 Nivel 3 y 4: DTOs y puertos de interfaz para FastAPI | Sprint 1 | 07/10 - 14/10 | @MarcoXMarquez | Must Have |
| #3 | [Frontend] Scaffolding del portal web con React, Vite y Tailwind CSS | Sprint 1 | 07/10 - 14/10 | @iccoscco | Must Have |
| #4 | [Spike Movil] Viabilidad tecnica de permisos de accesibilidad y bloqueo en Android | Sprint 1 | 07/10 - 14/10 | @rikich3 | Must Have |
| #5 | [Feature] Registro y verificacion de cuentas institucionales (@unsa.edu.pe) | Sprint 2 | 14/10 - 21/10 | @iccoscco, @MarcoXMarquez | Must Have |
| #6 | [Feature] Autenticacion segura con JWT, revocacion y control de acceso por roles (RBAC) | Sprint 2 | 14/10 - 21/10 | @MarcoXMarquez, @Sebastianzzzin, @iccoscco | Must Have |
| #7 | [Feature] Publicacion y administracion de fuentes oficiales vigentes para Secretaria | Sprint 3 | 21/10 - 28/10 | @iccoscco, @Sebastianzzzin | Must Have |
| #8 | [Feature] Motor RAG local con Ollama, generacion de embeddings y politica estricta de citas | Sprint 3 | 21/10 - 28/10 | @MarcoXMarquez, @rikich3 | Must Have |
| #9 | [Canal] Atencion conversacional en WhatsApp con Evolution API y n8n Community | Sprint 4 | 28/10 - 04/11 | @Sebastianzzzin, @MarcoXMarquez, @rikich3 | Must Have |
| #10 | [Canal] Bot interactivo de Telegram y seccion de acceso QR en el portal web | Sprint 4 | 28/10 - 04/11 | @Sebastianzzzin, @iccoscco | Must Have |
| #11 | [Feature] Vinculacion segura de canales de mensajeria mediante codigo OTP de 5 minutos | Sprint 5 | 04/11 - 11/11 | @Sebastianzzzin, @MarcoXMarquez, @iccoscco | Must Have |
| #12 | [Feature] Derivacion asistida a Secretaria (Handoff), gestion de tickets y aislamiento de datos | Sprint 5 | 04/11 - 11/11 | @iccoscco, @MarcoXMarquez, @rikich3 | Must Have |
| #13 | [Frontend/Backend] Consolidacion del portal web responsive (360px+) con tickets, paginacion y alertas | Sprint 6 | 11/11 - 18/11 | @iccoscco, @MarcoXMarquez, @Sebastianzzzin, @rikich3 | Must Have |
| #14 | [Mobile] App Android nativa en Kotlin con arquitectura MVVM, cache Room y sincronizacion ligera | Sprint 7 | 18/11 - 25/11 | @rikich3, @MarcoXMarquez | Must Have |
| #15 | [Mobile] Temporizador de sesiones de concentracion de estudio (5 a 120 min) y resiliencia local | Sprint 7 | 18/11 - 25/11 | @rikich3, @Sebastianzzzin | Must Have |
| #16 | [Mobile] Recordatorios programados de sesiones de estudio con AlarmManager y notificaciones | Sprint 8 | 25/11 - 02/12 | @rikich3 | Should Have |
| #17 | [Mobile] Restriccion consentida de aplicaciones distractoras durante sesiones de estudio | Sprint 8 | 25/11 - 02/12 | @rikich3 | Should Have |
| #18 | [QA/DevOps] Pruebas integrales E2E multi-canal y afinamiento de memoria de Ollama local | Sprint 8 | 25/11 - 02/12 | @Sebastianzzzin, @MarcoXMarquez, @iccoscco | Must Have |
| #19 | [Entrega] Piloto con 30 estudiantes, balance presupuestario, metricas de exito y Release v1.0 | Sprint 9 | 02/12 - 07/12 | @MarcoXMarquez, @Sebastianzzzin, @iccoscco, @rikich3 | Must Have |
| #20 | [Future] Panel de analitica y metricas de atencion anonimizadas para Secretaria (Could Have) | Posterior | Post-PMV | @iccoscco | Could Have |
| #21 | [Future] Integracion directa con el sistema universitario de matricula (Won't Have) | Posterior | Post-PMV | @MarcoXMarquez | Won't Have |

---

## 4. Estructura de Vistas Optimizadas en GitHub Projects

1. Vista 1: Sprint Activo (Kanban) — Filtro: Iteracion activa. Columnas: Backlog, Ready for Dev, In Progress, In Review, Done.
2. Vista 2: Mi Trabajo — Filtro: assignee:@me is:open.
3. Vista 3: Roadmap Semanal — Grafico de Gantt agrupado por Sprint semanal.
4. Vista 4: Backlog General — Tabla completa agrupada por Sprint con estado y prioridad.
5. Vista 5: Balance por Asignado — Columnas agrupadas por miembro del equipo.
