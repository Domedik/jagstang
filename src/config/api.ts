/**
 * API Configuration
 */

// URL base de la API
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost';

// URL base de la API de autenticación (puede ser diferente)
export const AUTH_API_BASE_URL =
  import.meta.env.VITE_AUTH_API_URL || 'http://localhost';

// API Key (si es requerida) - trim para evitar espacios/nuevas líneas del .env
export const API_KEY = (import.meta.env.VITE_API_KEY || '').trim();

// Endpoints disponibles
export const API_ENDPOINTS = {
  // Autenticación (disponibles en puerto 8000)
  AUTH_LOGIN: '/auth/login/',
  AUTH_OTP: '/auth/otp/',
  AUTH_PASSWORD: '/auth/password/',

  // Pacientes (disponibles) — vista unificada en v2.0
  PATIENTS_LIST: '/patients/',
  PATIENTS_CREATE: '/patients/',
  PATIENTS_GET: (id: string) => `/patients/${id}/`,
  PATIENTS_IDENTITY: (id: string) => `/patients/${id}/identity/`,
  PATIENTS_CLINICAL_SUMMARY: (id: string) =>
    `/patients/${id}/clinical-summary/`,
  // Signos vitales (toma actual). El último valor se lee de `vital` en la vista
  // unificada del paciente; `PUT` sobreescribe la toma actual.
  PATIENTS_VITALS: (id: string) => `/patients/${id}/vitals/`,

  // Notas (v2.0: JSON body; sub-recurso usa {resource_id})
  NOTES_LIST: (patientId: string) => `/patients/${patientId}/notes/`,
  NOTES_CREATE: (patientId: string) => `/patients/${patientId}/notes/`,
  NOTES_GET: (patientId: string, resourceId: string) =>
    `/patients/${patientId}/notes/${resourceId}/`,
  NOTES_SIGN: (patientId: string, resourceId: string) =>
    `/patients/${patientId}/notes/${resourceId}/sign/`,
  NOTES_SUMMARY: (patientId: string) => `/patients/${patientId}/notes/summary/`,

  // Archivos (v2.0: PUT para crear; item usa {resource_id})
  ASSETS_UPLOAD: (patientId: string) => `/patients/${patientId}/assets/`,
  ASSETS_GET: (patientId: string, resourceId: string) =>
    `/patients/${patientId}/assets/${resourceId}/`,

  // Eventos / tiempo real (SSE) — v2.0 ({client} = patient_id)
  EVENTS_STREAM: (client: string) => `/patients/${client}/events/`,

  // Citas (bigsby)
  APPOINTMENTS_LIST: '/appointments/',
  APPOINTMENTS_CREATE: '/appointments/',
  APPOINTMENTS_GET: (id: string) => `/appointments/${id}/`,
  APPOINTMENTS_UPDATE: (id: string) => `/appointments/${id}/`,

  // Contactos (no disponibles aún - ver api.md)
  CONTACTS_LIST: '/contacts/',
  CONTACTS_CREATE: '/contacts/',
  CONTACTS_GET: (id: string) => `/contacts/${id}/`,
  CONTACTS_UPDATE: (id: string) => `/contacts/${id}/`,
  CONTACTS_DELETE: (id: string) => `/contacts/${id}/`,

  // Equipo del doctor (nurses / assistants, servido por marauder)
  TEAM_LIST: '/doctor/team/',
  TEAM_CREATE: '/doctor/team/',
  TEAM_DELETE: (id: string) => `/doctor/team/${id}/`,
  // Lado del miembro: equipos a los que pertenece el usuario autenticado
  TEAM_MEMBERSHIPS: '/doctor/team/memberships/',
  DOCTOR_LANDING: '/doctor/landing/',
  DOCTOR_LANDING_PHOTO: '/doctor/landing/photo/',

  // Panel admin (rol ADMIN únicamente)
  ADMIN_DASHBOARD: '/admin/dashboard/',
  ADMIN_AUDIT_LOG: '/admin/audit-log',
  ADMIN_AUDIT_LOG_EXPORT: '/admin/audit-log/export/',
  ADMIN_USERS: '/admin/users/',
  // Asignación de enfermeras a equipos de doctores (servido por duosonic)
  ADMIN_TEAM_ASSIGN: '/admin/team/',
  ADMIN_TEAM_UNASSIGN: (nurseId: string, doctorId: string) =>
    `/admin/team/${nurseId}/?doctor=${encodeURIComponent(doctorId)}`,
  // Compliance NOM-004 por doctor de la clínica (servido por duosonic)
  ADMIN_COMPLIANCE_LIST: '/admin/compliance/',
  ADMIN_COMPLIANCE: (doctorId: string) => `/admin/compliance/${doctorId}/`,
  ADMIN_COMPLIANCE_OVERALL: (doctorId: string) =>
    `/admin/compliance/${doctorId}/overall_score/`,

  // Bigsby — disponibilidad, consultorios, solicitudes y citas
  LOCATIONS_LIST: '/locations/',
  LOCATIONS_CREATE: '/locations/',
  LOCATIONS_UPDATE: (id: string) => `/locations/${id}/`,
  LOCATIONS_DELETE: (id: string) => `/locations/${id}/`,
  AVAILABILITY_GET: '/availability/',
  AVAILABILITY_PUT: '/availability/',
  REQUESTS_LIST: '/requests/',
  REQUESTS_PATCH: (id: string) => `/requests/${id}/`,
};
