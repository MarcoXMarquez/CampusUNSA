# CampusUNSA: Secretario Jorge

Sistema de Atencion y Orientacion Universitaria para Pregrado
Escuela Profesional de Ingenieria de Sistemas - Universidad Nacional de San Agustin (UNSA)

---

## 1. Descripcion del Proyecto

CampusUNSA (Secretario Jorge) es una solucion tecnologica orientada a optimizar el proceso de atencion y consulta sobre tramites academicos, reglamentos y horarios universitarios. El sistema reduce los tiempos de espera y atencion de consultas frecuentes mediante un asistente virtual sustentado en fuentes oficiales y derivacion asistida a secretaria institucional para casos complejos.

## 2. Objetivos Principales

- Proveer atencion continua a estudiantes mediante canales habituales de mensajeria y plataformas digitales.
- Responder consultas frecuentes sustentandose exclusivamente en normativas vigentes mediante recuperacion semantica (RAG), garantizando trazabilidad y abstencion ante incertidumbre.
- Canalizar excepciones e incidentes no cubiertos mediante un sistema de tickets para gestion humana por parte de secretaria de escuela.
- Integrar herramientas de apoyo al rendimiento academico mediante una aplicacion movil con temporizador de sesiones de concentracion.

## 3. Arquitectura del Sistema

El sistema implementa una arquitectura self-hosted orientada a la eficiencia economica y soberania de datos, sin dependencia de suscripciones pagas en la nube:

- **Backend Central:** API REST desarrollada en FastAPI (Python).
- **Inferencia y Recuperacion:** Motor RAG local empleando Ollama y base de datos relacional PostgreSQL con extension pgvector para almacenamiento y similitud vectorial.
- **Canales de Mensajeria:**
  - WhatsApp: Integracion mediante Evolution API autoalojada y orquestacion con n8n Community.
  - Telegram: Bot institucional desarrollado sobre Telegram Bot API.
- **Frontend Web:** Aplicacion web responsiva en React con Vite y Tailwind CSS, compuesta por la interfaz de consulta para estudiantes y la consola administrativa de secretaria.
- **Aplicacion Movil:** Aplicacion nativa para Android desarrollada en Kotlin, con almacenamiento local seguro y soporte offline basico.

## 4. Integrantes del Equipo

- Marco Antonio Marquez Herrera (`@MarcoXMarquez`) - Tech Lead & Backend / IA Lead
- Alejandro Sebastian Alfonso Huacasi (`@Sebastianzzzin`) - Fullstack & Mensajeria / DevOps Lead
- Italo Frankdux Ccoscco Alvis (`@iccoscco`) - Frontend Web Lead & UI/UX Lead
- Ricardo Mauricio Chambilla Perca (`@rikich3`) - Mobile Developer Lead & QA Lead
