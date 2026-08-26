/**
 * API Service for Mustang API
 * Handles all HTTP requests to the backend API
 */

import {
  API_BASE_URL,
  AUTH_API_BASE_URL,
  API_KEY,
  API_ENDPOINTS,
} from '../config/api';
import {
  fetchWithTimeout,
  ApiTimeoutError,
  getErrorMessage,
} from '../utils/apiStatus';
import type { ApiSocialLinks } from '../data/landingProfile';

/** Wider timeout for the enriched (and slower) v2.0 patients list. */
const PATIENTS_LIST_TIMEOUT_MS = 60000;

function withDoctorScope(endpoint: string, doctor?: string): string {
  const scopedDoctor = doctor?.trim();
  if (!scopedDoctor) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}doctor=${encodeURIComponent(scopedDoctor)}`;
}

export interface ApiError {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
}

/** `/doctor/templates/` — `content` is an opaque, server-unvalidated JSON string. */
export interface DoctorTemplateDTO {
  id: string;
  name: string;
  content: string;
}

/** Named clinical line in the clinical summary (allergy, medication, condition). */
export interface ApiClinicalSummaryLine {
  name: string;
  suggested?: boolean;
}

/** Clinical summary (v2.0 `summary` / `PATCH clinical-summary/`). */
export interface ApiClinicalSummary {
  blood_type?: string | null;
  allergies?: ApiClinicalSummaryLine[] | null;
  medications?: ApiClinicalSummaryLine[] | null;
  chronic_conditions?: ApiClinicalSummaryLine[] | null;
}

/**
 * Signos vitales — toma actual (v2.0 `vital` / `PUT /patients/{id}/vitals/`).
 *
 * Shape confirmado contra el struct del backend. Ojo con los enteros: en Go
 * `heart_rate_bpm`, `respiratory_rate_bpm` y las dos presiones son `*int16`
 * (mandar decimales rompe la deserialización — ver `toApiVital`); el resto son
 * `*float64`. `taken_at` es RFC3339 (ISO string). La lectura en
 * `usePatientSignosVitales` es defensiva (acepta alias).
 */
/** Quién tomó los signos (objeto de usuario que embebe la vista unificada). */
export interface ApiVitalTaker {
  id?: string;
  name?: string;
  lastname?: string;
  email?: string;
}

export interface ApiVital {
  /** int16 */
  blood_pressure_systolic_mm_hg?: number | null;
  /** int16 */
  blood_pressure_diastolic_mm_hg?: number | null;
  /** int16 */
  heart_rate_bpm?: number | null;
  /** int16 */
  respiratory_rate_bpm?: number | null;
  temperature_celsius?: number | null;
  oxygen_saturation?: number | null;
  glucose_mg_dl?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  abdominal_perimeter_cm?: number | null;
  notes?: string | null;
  taken_at?: string | null;
  /** Objeto de usuario `{ id, name, lastname, email }`, o string en formas legacy. */
  taken_by?: ApiVitalTaker | string | null;
  [key: string]: unknown;
}

/** Identity sheet (v2.0 `identity_sheet` / `PATCH identity/`). */
export interface ApiIdentity {
  birthdate?: string;
  gender?: string;
  birthplace_state?: string;
  birthplace_country?: string;
  birthplace_city?: string;
  residence_state?: string;
  residence_country?: string;
  residence_city?: string;
  occupation?: string;
  referred_by?: string;
  education?: string;
  marital_status?: string;
  religion?: string;
  nationality?: string;
  education_level?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

/** Parent note reference (v2.0 `parent`, was v1.7 `is_follow_up_of`). */
export interface ApiNoteParent {
  id: string;
  note_type: string;
  title: string;
  custom_date: string;
}

/** Completeness analysis embedded on the note (v2.0; may be null until computed). */
export interface ApiNoteAnalysis {
  completeness_score: number;
  missing_fields?: string[];
  uncertain_fields?: string[];
  reasoning: Record<string, string>;
}

/** Medical note (v2.0). `attachments` is no longer returned. */
export interface ApiNote {
  id: string;
  title?: string;
  content?: string;
  type?: string;
  note_type?: string;
  status?: string;
  is_signed?: boolean;
  signed_at?: string;
  signed_by?: string;
  created_at: string;
  updated_at?: string;
  custom_date?: string;
  parent?: ApiNoteParent | null;
  analysis?: ApiNoteAnalysis | null;
}

/**
 * Unified patient view (v2.0 `GET /patients/{id}/`, also the row shape of
 * `GET /patients/`). Embeds the latest related sub-resources.
 */
export interface ApiPatientUnified {
  id: string;
  slug?: string;
  name: string;
  lastname: string;
  lastname_m: string | null;
  is_recurrent: boolean;
  phone?: string;
  summary?: ApiClinicalSummary | null;
  identity_sheet?: ApiIdentity | null;
  interrogatory?: ApiNote | null;
  vital?: ApiVital | null;
}

/**
 * `GET /admin/audit-log?page=&size=` (ADMIN role only) — now has `json:"..."`
 * tags throughout, so every key is lowercase snake_case (no more PascalCase).
 * `timestamp` is RFC3339 with offset + microseconds. `metadata` is a real JSON
 * object (not a serialized string), with `action` (descripción legible) y
 * campos extra variables (ej. `count`) según el evento — no hay lista cerrada
 * de llaves.
 */
export interface ApiAdminAuditActor {
  id: string;
  name: string;
  lastname: string;
  role: string;
  session: string;
}

export interface ApiAdminAuditRequest {
  id: string;
  user_agent: string;
  ip_address: string;
  path: string;
}

export interface ApiAdminAuditEvent {
  id: string;
  timestamp: string;
  event_type: string;
  /** Go `LogLevel` enum: `"success" | "info" | "warning" | "error"`. */
  level: string;
  actor: ApiAdminAuditActor;
  request: ApiAdminAuditRequest;
  metadata: Record<string, unknown>;
}

/**
 * `GET /admin/users?q=...` (ADMIN role only) — Go struct, sin tags `json:"..."`.
 *
 * `RoleLabel` ya viene traducido/formateado (ej. "Doctor", "Administrador") —
 * mostrar tal cual en el badge de rol; `Role` es el valor crudo del enum, útil
 * solo para lógica condicional (ej. elegir color de badge). `AvatarURL` puede
 * venir `""` — cae al fallback de iniciales en cliente (`initialsOf`).
 * `UpdatedFmt` ya viene formateado en español, no reformatear.
 */
export interface ApiAdminUserRow {
  ID: string;
  Name: string;
  Email: string;
  Role: string;
  RoleLabel: string;
  AvatarURL: string;
  UpdatedFmt: string;
}

/**
 * `GET /admin/dashboard/` (ADMIN role only) — snapshot de métricas operativas.
 * Ventanas half-open en días calendario locales de la clínica
 * (America/Mexico_City): `today` = hoy vs ayer, `week` = últimos 7 días vs
 * los 7 anteriores, `month` = últimos 30 vs los 30 anteriores.
 */
export interface ApiAdminWindowMetric {
  current: number;
  previous: number;
}

export interface ApiAdminResourceMetrics {
  total: number;
  today: ApiAdminWindowMetric;
  week: ApiAdminWindowMetric;
  month: ApiAdminWindowMetric;
}

/** Un día calendario (local) de la serie de actividad de 30 días; sin huecos. */
export interface ApiAdminSeriesPoint {
  date: string; // YYYY-MM-DD
  new_patients: number;
  notes_created: number;
  notes_signed: number;
  appointments: number;
}

export interface ApiAdminDashboard {
  generated_at: string;
  patients: ApiAdminResourceMetrics;
  notes: {
    created: ApiAdminResourceMetrics;
    /** Ventanas sobre `signed_at`; `total` = notas firmadas. */
    signed: ApiAdminResourceMetrics;
    drafts: number;
  };
  appointments: {
    /** Ventanas sobre `starts_at` (cuándo ocurre la cita). */
    scheduled: ApiAdminResourceMetrics;
    /** Últimos 30 días. `status`: PENDING | CONFIRMED | COMPLETED | CANCELLED. */
    by_status: Array<{ status: string; count: number }>;
  };
  users: Array<{ role: string; count: number }>;
  series: ApiAdminSeriesPoint[];
}

/**
 * Compliance NOM-004 por doctor (servido por duosonic, ADMIN role only).
 * Shape idéntico al que marauder sirve por doctor, pero aquí el `doctor_id`
 * viene del path (el admin evalúa a cualquier doctor de la clínica).
 */
export interface ApiAdminComplianceMetric {
  name: string;
  score: number;
  detail: string;
  items: number;
  passing: number;
}

export interface ApiAdminCompliancePatient {
  patient_id: string;
  patient_slug?: string;
  overall_score: number;
  alert_level: 'ok' | 'warning' | 'critical';
  metrics: Record<string, ApiAdminComplianceMetric>;
  computed_at: string;
}

/** `GET /admin/compliance/{doctor_id}/` — reporte completo de un doctor. */
export interface ApiAdminDoctorCompliance {
  doctor_id: string;
  overall_score: number;
  patient_count: number;
  alert_breakdown: { ok: number; warning: number; critical: number };
  worst_metric: string;
  patients: ApiAdminCompliancePatient[];
}

/** `GET /admin/compliance/{doctor_id}/overall_score/` — score ligero. */
export interface ApiAdminDoctorOverallScore {
  doctor_id: string;
  overall_score: number;
  patient_count: number;
  computed_at: string;
}

/** Fila del listado paginado: un doctor con su score agregado. */
export interface ApiAdminDoctorComplianceRow {
  doctor_id: string;
  doctor_name: string;
  email: string;
  overall_score: number;
  patient_count: number;
  alert_level: 'ok' | 'warning' | 'critical';
}

/** Agregado de la página actual (computado server-side). */
export interface ApiAdminClinicSummary {
  clinic_score: number;
  total_doctors: number;
  total_patients: number;
  alert_breakdown: { ok: number; warning: number; critical: number };
}

/** `GET /admin/compliance/` — listado de doctores paginado server-side. */
export interface ApiAdminComplianceList {
  count: number;
  page: number;
  size: number;
  summary: ApiAdminClinicSummary;
  results: ApiAdminDoctorComplianceRow[];
}

/** `/doctor/team/` — miembro del equipo del doctor (id = user id / Cognito sub). */
export interface ApiTeamMember {
  id: string;
  name: string;
  family_name: string;
  email: string;
  role: 'nurse' | 'assistant';
  /** Fecha de alta en el equipo (ISO). */
  since: string;
}

/** `/doctor/team/memberships/` — un equipo al que pertenece el usuario actual. */
export interface ApiTeamMembership {
  doctor_id: string;
  doctor_name: string;
  doctor_family_name: string;
  role: 'nurse' | 'assistant';
}

export interface ApiDoctorLanding {
  display_name: string;
  specialty?: string | null;
  specialty_icon?: string | null;
  bio?: string | null;
  social_links?: ApiSocialLinks;
  photo_url?: string | null;
  is_published: boolean;
  public_url?: string | null;
}

class ApiService {
  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // API requiere: X-Clineo-Api-Key, X-Clineo-Identity (token), Authorization: Bearer login.access
    if (API_KEY) {
      headers['X-Clineo-Api-Key'] = API_KEY;
    }

    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const idFromLogin = localStorage.getItem('id_token');
    if (idFromLogin) {
      headers['X-Clineo-Identity'] = idFromLogin;
    }

    return headers;
  }

  /**
   * Consume Server-Sent Events (SSE) desde un ReadableStream.
   * Soporta frames tipo:
   *   event: <name>
   *   data: <payload>
   *   data: <payload line 2>
   *
   * (líneas separadas por \n y eventos separados por \n\n)
   */
  private async consumeSseStream(args: {
    response: Response;
    onMessage: (msg: { event?: string; data: string }) => void;
    signal?: AbortSignal;
  }) {
    const { response, onMessage, signal } = args;
    if (!response.body) {
      throw {
        message: 'Respuesta sin body (stream no disponible)',
        status: 0,
      } as ApiError;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const flush = () => {
      // Procesa eventos completos separados por doble salto de línea
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        idx = buffer.indexOf('\n\n');

        const lines = rawEvent.split('\n');
        let eventName: string | undefined;
        const dataLines: string[] = [];

        for (const ln of lines) {
          const line = ln.replace(/\r$/, '');
          if (!line || line.startsWith(':')) continue; // comentario/keepalive
          if (line.startsWith('event:')) {
            eventName = line.slice('event:'.length).trim() || undefined;
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trimStart());
            continue;
          }
        }

        const data = dataLines.join('\n');
        onMessage({ event: eventName, data });
      }
    };

    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flush();
    }
    // intenta procesar lo que falte (sin \n\n final)
    if (buffer.trim()) {
      buffer += '\n\n';
      flush();
    }
  }

  /**
   * Consume un stream que envía objetos JSON concatenados (sin newlines),
   * por ejemplo: {"type":"chunk","data":"..."}{"type":"chunk","data":"..."}
   *
   * Extrae objetos completos con un parser incremental basado en conteo de llaves,
   * respetando strings y escapes.
   */
  private async consumeConcatenatedJsonObjects(args: {
    response: Response;
    onObject: (obj: unknown) => void;
    signal?: AbortSignal;
  }) {
    const { response, onObject, signal } = args;
    if (!response.body) {
      throw {
        message: 'Respuesta sin body (stream no disponible)',
        status: 0,
      } as ApiError;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const tryExtract = () => {
      // Avanza hasta el primer "{"
      const start = buffer.indexOf('{');
      if (start === -1) {
        buffer = buffer.trimStart();
        return;
      }
      if (start > 0) buffer = buffer.slice(start);

      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];

        if (inString) {
          if (escape) {
            escape = false;
          } else if (ch === '\\') {
            escape = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;

        if (depth === 0) {
          const raw = buffer.slice(0, i + 1);
          buffer = buffer.slice(i + 1);
          try {
            onObject(JSON.parse(raw));
          } catch {
            // si algo salió mal, reinyecta y espera más data
            buffer = raw + buffer;
            return;
          }
          // Puede haber más objetos concatenados; intenta de nuevo recursivamente.
          tryExtract();
          return;
        }
      }
    };

    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      tryExtract();
    }

    // último intento por si el stream cerró justo al final
    if (buffer.trim()) {
      tryExtract();
    }
  }

  private getPublicHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (API_KEY) {
      headers['X-Clineo-Api-Key'] = API_KEY;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs?: number
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    let headers: HeadersInit = {
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    // Remove Content-Type for FormData
    if (options.body instanceof FormData) {
      const headersObj = headers as Record<string, string>;
      delete headersObj['Content-Type'];
      headers = headersObj;
    }

    try {
      const response = await fetchWithTimeout(
        url,
        {
          ...options,
          headers,
        },
        timeoutMs
      );

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('id_token');
          localStorage.removeItem('doctor');
          window.location.href = '/login';
        }
        const errorData = await response.json().catch(() => ({
          message: response.statusText,
        }));
        throw {
          message: errorData.message || errorData.detail || 'An error occurred',
          status: response.status,
          errors: errorData.errors,
        } as ApiError;
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return {} as T;
    } catch (error) {
      if (error instanceof ApiTimeoutError) {
        throw { message: error.message, status: 0 } as ApiError;
      }
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw {
        message: 'Network error or server unavailable',
        status: 0,
      } as ApiError;
    }
  }

  // ============ PATIENTS ============

  /**
   * List all patients with pagination
   */
  async listPatients(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());

    const query = queryParams.toString();
    return this.request<{
      page: number;
      size: number;
      count: number;
      results: ApiPatientUnified[];
    }>(
      `/patients/${query ? `?${query}` : ''}`,
      {},
      // v2.0 GET /patients/ returns enriched rows (summary/identity/vital
      // embedded), so a large page is much slower to first byte than the old
      // /patients/table/. Give it a wider budget than the default so a slow but
      // valid response isn't aborted (which otherwise trips the timeout overlay).
      PATIENTS_LIST_TIMEOUT_MS
    );
  }

  /**
   * Get a specific patient by ID (unified view — embeds summary, identity_sheet,
   * interrogatory and vital).
   */
  async getPatient(patientId: string) {
    return this.request<ApiPatientUnified>(`/patients/${patientId}/`);
  }

  /**
   * Create a new patient
   */
  async createPatient(data: {
    name: string;
    lastname: string;
    lastname_m?: string;
    phone?: string;
  }) {
    return this.request<{
      id: string;
      name: string;
      lastname: string;
      lastname_m?: string;
      phone: string;
    }>('/patients/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update patient — PUT /patients/<id>/ (mismo shape que POST create)
   */
  async updatePatient(
    patientId: string,
    data: {
      name: string;
      lastname: string;
      lastname_m?: string;
      phone?: string;
    }
  ) {
    return this.request<{
      id: string;
      name: string;
      lastname: string;
      lastname_m?: string | null;
      phone?: string;
    }>(`/patients/${patientId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ============ PATIENT IDENTITY ============

  /**
   * Upsert the patient identity sheet (v2.0 `PATCH /patients/{id}/identity/`).
   * The current values are read from the unified patient view (`identity_sheet`).
   */
  async upsertPatientIdentity(patientId: string, data: Record<string, string>) {
    return this.request<ApiIdentity>(`/patients/${patientId}/identity/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ============ CLINICAL SUMMARY ============

  /**
   * Upsert the patient clinical summary (v2.0 `PATCH
   * /patients/{id}/clinical-summary/`). Current values are read from the unified
   * patient view (`summary`). Replaces the v1.7 `/vitals/` blood-type/allergies
   * resource.
   */
  async upsertClinicalSummary(
    patientId: string,
    data: {
      blood_type: string | null;
      allergies: ApiClinicalSummaryLine[];
      medications: ApiClinicalSummaryLine[];
      chronic_conditions: ApiClinicalSummaryLine[];
    }
  ) {
    return this.request<ApiClinicalSummary>(
      `/patients/${patientId}/clinical-summary/`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
  }

  // ============ VITAL SIGNS ============

  /**
   * Upsert the patient's current vital signs (`PUT /patients/{id}/vitals/`).
   * Overwrites the current take ("solo el último valor"). The stored value is
   * surfaced under `vital` in the unified patient view (there is no `GET`).
   */
  async upsertPatientVitals(patientId: string, data: ApiVital) {
    return this.request<ApiVital>(`/patients/${patientId}/vitals/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ============ CONTACTS ============

  /**
   * List contacts for the current doctor
   * GET /doctor/contacts/
   */
  async listContacts(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());

    const query = queryParams.toString();
    return this.request<{
      results: Array<{
        id: string;
        name: string;
        lastname: string;
        alias: string | null;
        type: string;
        email: string | null;
        phone: string | null;
        organization: string | null;
        role: string | null;
      }>;
      count: number;
      page: number;
      size: number;
    }>(`/doctor/contacts/${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new contact
   * POST /doctor/contacts/
   */
  async createContact(data: {
    name: string;
    lastname: string;
    alias?: string;
    type: string;
    email?: string;
    phone?: string;
    organization?: string;
    role?: string;
  }) {
    return this.request<void>('/doctor/contacts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update an existing contact
   * api.md muestra PUT /doctor/contacts/ sin ID,
   * pero seguimos el patrón REST usando /doctor/contacts/<id>/.
   */
  async updateContact(
    contactId: string,
    data: {
      name: string;
      lastname: string;
      alias?: string;
      type: string;
      email?: string;
      phone?: string;
      organization?: string;
      role?: string;
    }
  ) {
    return this.request<void>(`/doctor/contacts/${contactId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Archive (soft delete) a contact
   * DELETE /doctor/contacts/<contact_id>
   */
  async archiveContact(contactId: string) {
    return this.request<void>(`/doctor/contacts/${contactId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Restore an archived contact
   * POST /doctor/contacts/<contact_id>/restore/
   */
  async restoreContact(contactId: string) {
    return this.request<void>(`/doctor/contacts/${contactId}/restore/`, {
      method: 'POST',
      body: JSON.stringify(null),
    });
  }

  /**
   * Get a single contact by ID
   * GET /doctor/contacts/<contact_id>/
   */
  async getContact(contactId: string) {
    return this.request<{
      id: string;
      name: string;
      lastname: string;
      alias: string | null;
      type: string;
      email: string | null;
      phone: string | null;
      organization: string | null;
      role: string | null;
    }>(`/doctor/contacts/${contactId}/`);
  }

  // ============ ADMIN PANEL ============

  /** Server-side filters supported by `/admin/audit-log` and its `/export/` sibling. */
  private buildAuditLogQuery(params?: {
    page?: number;
    size?: number;
    date?: string;
    event_type?: string;
    actor_id?: string;
    session_id?: string;
    ip_address?: string;
    request_id?: string;
  }): string {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    if (params?.date) queryParams.append('date', params.date);
    if (params?.event_type) queryParams.append('event_type', params.event_type);
    if (params?.actor_id) queryParams.append('actor_id', params.actor_id);
    if (params?.session_id) queryParams.append('session_id', params.session_id);
    if (params?.ip_address) queryParams.append('ip_address', params.ip_address);
    if (params?.request_id) queryParams.append('request_id', params.request_id);
    return queryParams.toString();
  }

  /**
   * Admin audit log (ADMIN role only).
   * GET /admin/audit-log?page=&size=&date=&event_type=&actor_id=&session_id=&ip_address=&request_id=
   */
  async getAdminAuditLog(params?: {
    page?: number;
    size?: number;
    date?: string;
    event_type?: string;
    actor_id?: string;
    session_id?: string;
    ip_address?: string;
    request_id?: string;
  }) {
    const query = this.buildAuditLogQuery(params);
    return this.request<ApiAdminAuditEvent[]>(
      `${API_ENDPOINTS.ADMIN_AUDIT_LOG}${query ? `?${query}` : ''}`
    );
  }

  /**
   * Exporta la vista actual del audit log como CSV (ADMIN role only) — mismos
   * filtros que `getAdminAuditLog`.
   * GET /admin/audit-log/export/?page=&size=&date=&event_type=&actor_id=&session_id=&ip_address=&request_id=
   */
  async exportAdminAuditLog(params?: {
    page?: number;
    size?: number;
    date?: string;
    event_type?: string;
    actor_id?: string;
    session_id?: string;
    ip_address?: string;
    request_id?: string;
  }): Promise<Blob> {
    const query = this.buildAuditLogQuery(params);
    const url = `${API_BASE_URL}${API_ENDPOINTS.ADMIN_AUDIT_LOG_EXPORT}${query ? `?${query}` : ''}`;
    const response = await fetchWithTimeout(url, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      throw {
        message: 'Error al exportar el audit log',
        status: response.status,
      } as ApiError;
    }
    return response.blob();
  }

  /**
   * Admin users list (ADMIN role only).
   * GET /admin/users?q=... — `q` filtra por nombre/apellido/email (no por rol todavía).
   */
  async getAdminUsers(params?: { q?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.q) queryParams.append('q', params.q);
    const query = queryParams.toString();
    return this.request<ApiAdminUserRow[]>(
      `${API_ENDPOINTS.ADMIN_USERS}${query ? `?${query}` : ''}`
    );
  }

  /**
   * Create user (ADMIN role only).
   * POST /admin/users/ — crea la cuenta en Cognito y el registro en la tabla
   * `users` (id = sub de Cognito). Devuelve el row con el mismo shape del
   * listado. 409 = email ya registrado; 400 = payload/contraseña inválida
   * (política del user pool).
   */
  async createAdminUser(data: {
    email: string;
    name: string;
    family_name: string;
    role: string;
    password: string;
    /** Doctor-only: public landing slug (`[a-z0-9-]+`). 409 LANDINGS:SLUG_TAKEN. */
    slug?: string;
  }) {
    return this.request<ApiAdminUserRow>(API_ENDPOINTS.ADMIN_USERS, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Asigna una enfermera existente al equipo de un doctor (ADMIN role only,
   * servido por duosonic). Ambos ids son de la tabla `users`.
   * POST /admin/team/ — 409 = ya está en ese equipo; 400 = doctor/nurse
   * inválido.
   */
  async adminAssignNurse(data: { doctor: string; nurse: string }) {
    return this.request<{ doctor_id: string; nurse_id: string; role: string }>(
      API_ENDPOINTS.ADMIN_TEAM_ASSIGN,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Quita a una enfermera del equipo de un doctor (ADMIN role only).
   * DELETE /admin/team/<nurse_id>/?doctor=<doctor_id>
   */
  async adminUnassignNurse(nurseId: string, doctorId: string) {
    return this.request<void>(
      API_ENDPOINTS.ADMIN_TEAM_UNASSIGN(nurseId, doctorId),
      { method: 'DELETE' }
    );
  }

  /**
   * Admin dashboard metrics (ADMIN role only).
   * GET /admin/dashboard/
   */
  async getAdminDashboard() {
    return this.request<ApiAdminDashboard>(API_ENDPOINTS.ADMIN_DASHBOARD);
  }

  /**
   * Compliance NOM-004 completo de un doctor de la clínica (ADMIN role only).
   * GET /admin/compliance/<doctor_id>/ — incluye el desglose por paciente.
   */
  async getAdminDoctorCompliance(doctorId: string) {
    return this.request<ApiAdminDoctorCompliance>(
      API_ENDPOINTS.ADMIN_COMPLIANCE(doctorId)
    );
  }

  /**
   * Score agregado ligero de un doctor de la clínica (ADMIN role only).
   * GET /admin/compliance/<doctor_id>/overall_score/
   */
  async getAdminDoctorComplianceOverallScore(doctorId: string) {
    return this.request<ApiAdminDoctorOverallScore>(
      API_ENDPOINTS.ADMIN_COMPLIANCE_OVERALL(doctorId)
    );
  }

  /**
   * Listado de doctores con su compliance, paginado server-side (ADMIN role
   * only, servido por duosonic).
   * GET /admin/compliance/?page=&size=&q= — `q` filtra nombre/apellido/email.
   */
  async getAdminComplianceList(params?: {
    page?: number;
    size?: number;
    q?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.size) queryParams.append('size', String(params.size));
    if (params?.q) queryParams.append('q', params.q);
    const query = queryParams.toString();
    return this.request<ApiAdminComplianceList>(
      `${API_ENDPOINTS.ADMIN_COMPLIANCE_LIST}${query ? `?${query}` : ''}`
    );
  }

  // ============ APPOINTMENTS (bigsby) ============

  /**
   * List appointments for the current doctor
   * GET /appointments/
   */
  async listAppointments(params?: {
    page?: number;
    size?: number;
    doctor?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    if (params?.doctor) queryParams.append('doctor', params.doctor);

    const query = queryParams.toString();
    return this.request<{
      results: Array<{
        id: string;
        doctor_id: string;
        patient_id: string;
        location_id?: string | null;
        starts_at: string;
        ends_at: string;
        status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
        additional_notes?: string | null;
        created_at?: string;
      }>;
      count: number;
      size: number;
    }>(`${API_ENDPOINTS.APPOINTMENTS_LIST}${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new appointment
   * POST /appointments/
   * Assistants scope the request with `?doctor=<id>`.
   */
  async createAppointment(data: {
    patient: string;
    doctor?: string;
    starts_at: string;
    duration: string;
    additional_notes?: string;
    location_id?: string | null;
  }) {
    const body: Record<string, unknown> = {
      patient_id: data.patient,
      starts_at: data.starts_at,
      duration: data.duration,
    };
    if (data.additional_notes) body.additional_notes = data.additional_notes;
    if (data.location_id) body.location_id = data.location_id;
    return this.request<void>(
      withDoctorScope(API_ENDPOINTS.APPOINTMENTS_CREATE, data.doctor),
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }

  /**
   * Get a single appointment by ID
   * GET /appointments/<id>/
   */
  async getAppointment(id: string, doctor?: string) {
    return this.request<{
      id: string;
      doctor_id: string;
      patient_id: string;
      location_id?: string | null;
      starts_at: string;
      ends_at: string;
      status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
      additional_notes?: string | null;
      created_at?: string;
    }>(withDoctorScope(API_ENDPOINTS.APPOINTMENTS_GET(id), doctor));
  }

  /**
   * Update appointment status
   * PATCH /appointments/<id>/status/
   */
  async updateAppointmentStatus(
    id: string,
    status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
    doctor?: string
  ) {
    return this.request<void>(
      withDoctorScope(`${API_ENDPOINTS.APPOINTMENTS_GET(id)}status/`, doctor),
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  }

  /**
   * Soft-delete an appointment
   * DELETE /appointments/<id>/
   */
  async deleteAppointment(id: string, doctor?: string) {
    return this.request<void>(
      withDoctorScope(API_ENDPOINTS.APPOINTMENTS_GET(id), doctor),
      {
        method: 'DELETE',
      }
    );
  }

  // ============ TEAM (equipo del doctor) ============

  async getDoctorLanding() {
    return this.request<ApiDoctorLanding>(API_ENDPOINTS.DOCTOR_LANDING);
  }

  async updateDoctorLanding(data: {
    display_name?: string;
    specialty?: string;
    specialty_icon?: string | null;
    bio?: string;
    social_links?: ApiSocialLinks;
  }) {
    return this.request<ApiDoctorLanding>(API_ENDPOINTS.DOCTOR_LANDING, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async uploadDoctorLandingPhoto(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.request<ApiDoctorLanding>(API_ENDPOINTS.DOCTOR_LANDING_PHOTO, {
      method: 'PUT',
      body: form,
    });
  }

  /**
   * List the acting doctor's team members
   * GET /doctor/team/
   */
  async listTeamMembers(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    const query = queryParams.toString();
    return this.request<{
      results: ApiTeamMember[];
      count: number;
      size: number;
    }>(`${API_ENDPOINTS.TEAM_LIST}${query ? `?${query}` : ''}`);
  }

  /**
   * Add a member to the acting doctor's team. Si el correo no tiene cuenta,
   * el backend la crea en Cognito (password obligatorio); si ya existe como
   * nurse/assistant solo se asigna al equipo (password ignorado). Solo
   * doctores — la asignación por admins va por duosonic (adminAssignNurse).
   * POST /doctor/team/
   */
  async addTeamMember(data: {
    email: string;
    name: string;
    family_name: string;
    role: 'nurse' | 'assistant';
    password?: string;
  }) {
    return this.request<ApiTeamMember>(API_ENDPOINTS.TEAM_CREATE, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Remove a member from the team (revoca también sus grants de equipo)
   * DELETE /doctor/team/<user_id>/
   */
  async removeTeamMember(id: string) {
    return this.request<void>(API_ENDPOINTS.TEAM_DELETE(id), {
      method: 'DELETE',
    });
  }

  /**
   * Teams the authenticated user belongs to (lado nurse/assistant)
   * GET /doctor/team/memberships/
   */
  async listTeamMemberships() {
    return this.request<ApiTeamMembership[]>(API_ENDPOINTS.TEAM_MEMBERSHIPS);
  }

  // ============ MEDICAL NOTES ============

  /**
   * Get count of notes for the current month
   * GET /doctor/notes/count/
   */
  async getDoctorNotesCount() {
    return this.request<{ count: number }>('/doctor/notes/count/');
  }

  /**
   * Get doctor notes (recent, this month)
   * GET /doctor/notes/recent/
   */
  async getDoctorNotesRecent(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    const query = queryParams.toString();
    return this.request<{
      results: Array<{
        id: string;
        title: string;
        status: string;
        patient_id: string;
        patient_name: string;
        patient_lastname: string;
        created_at?: string;
        updated_at?: string;
        accessed_at?: string;
      }>;
      count: number;
      page: number;
      size: number;
    }>(`/doctor/notes/recent/${query ? `?${query}` : ''}`);
  }

  /**
   * GET /doctor/fields/
   * Lista de campos creados por el doctor (para formularios).
   */
  async getDoctorFields(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page != null)
      queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    const query = queryParams.toString();
    return this.request<{
      results: Array<{
        id: string;
        name: string;
        type: string;
        required: boolean;
      }>;
      count: number;
      page: number;
      size: number;
    }>(`/doctor/fields/${query ? `?${query}` : ''}`);
  }

  /**
   * POST /doctor/fields/
   * Crear campo del doctor. Payload: { name, type, required }.
   */
  async createDoctorField(body: {
    name: string;
    type: string;
    required: boolean;
  }) {
    return this.request<{
      id: string;
      name: string;
      type: string;
      required: boolean;
    }>('/doctor/fields/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH /doctor/fields/<id>/
   * Actualizar campo. Mismo payload que POST.
   */
  async updateDoctorField(
    fieldId: string,
    body: { name: string; type: string; required: boolean }
  ) {
    return this.request<{
      id: string;
      name: string;
      type: string;
      required: boolean;
    }>(`/doctor/fields/${fieldId}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE /doctor/fields/<id>/
   */
  async deleteDoctorField(fieldId: string) {
    return this.request<void>(`/doctor/fields/${fieldId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * POST /doctor/forms/
   * multipart/form-data: files (PDF), name, fields (JSON string)
   */
  async createDoctorForm(pdfFile: File, name: string, fields: unknown[]) {
    const formData = new FormData();
    formData.append('files', pdfFile);
    formData.append('name', name);
    formData.append('fields', JSON.stringify(fields));
    return this.request<{ id: string; name: string }>('/doctor/forms/', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * DELETE /doctor/forms/<form_id>/
   */
  async deleteDoctorForm(formId: string) {
    return this.request<void>(`/doctor/forms/${formId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * GET /doctor/forms/
   * Lista de formularios guardados del doctor.
   */
  async listDoctorForms(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page != null)
      queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    const query = queryParams.toString();
    return this.request<{
      results: Array<{ id: string; name: string }>;
      count: number;
      page: number;
      size: number;
    }>(`/doctor/forms/${query ? `?${query}` : ''}`);
  }

  /**
   * GET /doctor/forms/<formId>/
   * Detalle de un formulario guardado.
   */
  async getDoctorForm(formId: string) {
    return this.request<{
      id: string;
      name: string;
      key: string;
      fields: Array<{
        id: string;
        position?: {
          x: number;
          y: number;
          page: number;
          width: number;
          height: number;
        };
      }>;
    }>(`/doctor/forms/${formId}/`);
  }

  /**
   * GET /doctor/assets/<assetId>/
   * Descarga un asset (PDF) como blob.
   */
  async getDoctorAsset(assetId: string): Promise<Blob> {
    const url = `${API_BASE_URL}/doctor/assets/${assetId}/`;
    const response = await fetchWithTimeout(url, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      throw {
        message: 'Error al descargar el asset',
        status: response.status,
      } as ApiError;
    }
    return response.blob();
  }

  /**
   * GET /doctor/assets/
   * Lista de archivos subidos por el doctor autenticado.
   */
  async listDoctorAssets(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page != null)
      queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    const query = queryParams.toString();
    return this.request<{
      results: Array<{
        id: string;
        filename: string;
        file_size: number;
        mime_type: string;
      }>;
      count: number;
      size: number;
    }>(`/doctor/assets/${query ? `?${query}` : ''}`);
  }

  /**
   * PUT /doctor/assets/
   * Sube uno o varios archivos del doctor en una sola llamada (campo `files`).
   */
  async uploadDoctorAssets(files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return this.request<{
      results: Array<{
        id: string;
        filename: string;
        file_size: number;
        mime_type: string;
      }>;
      count: number;
      size: number;
    }>('/doctor/assets/', {
      method: 'PUT',
      body: formData,
    });
  }

  /**
   * GET /doctor/templates/
   * Lista de templates (notas/plantillas) del doctor.
   */
  async listDoctorTemplates(params?: { page?: number; size?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.page != null)
      queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    const query = queryParams.toString();
    return this.request<{
      results: DoctorTemplateDTO[];
      count: number;
      page: number;
      size: number;
    }>(`/doctor/templates/${query ? `?${query}` : ''}`);
  }

  /**
   * POST /doctor/templates/
   * `content` es un string opaco (el servidor no lo valida) — el llamador es
   * responsable de serializar/parsear su propio modelo JSON.
   */
  async createDoctorTemplate(body: { name: string; content: string }) {
    return this.request<DoctorTemplateDTO>('/doctor/templates/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * GET /doctor/templates/<id>/
   */
  async getDoctorTemplate(templateId: string) {
    return this.request<DoctorTemplateDTO>(`/doctor/templates/${templateId}/`);
  }

  /**
   * PUT /doctor/templates/<id>/
   */
  async updateDoctorTemplate(
    templateId: string,
    body: { name: string; content: string }
  ) {
    return this.request<DoctorTemplateDTO>(`/doctor/templates/${templateId}/`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * GET /doctor/compliance/
   */
  async getDoctorCompliance() {
    return this.request<{
      doctor_id: string;
      overall_score: number;
      patient_count: number;
      alert_breakdown: { critical: number; ok: number; warning: number };
      worst_metric: string;
      patients: Array<{
        patient_id: string;
        overall_score: number;
        alert_level: 'ok' | 'warning' | 'critical';
        metrics: Record<
          string,
          {
            name: string;
            score: number;
            detail: string;
            items: number;
            passing: number;
          }
        >;
        computed_at: string;
      }>;
    }>('/doctor/compliance/');
  }

  /**
   * GET /doctor/compliance/overall_score/
   * Score agregado de cumplimiento NOM del doctor.
   */
  async getDoctorComplianceOverallScore() {
    return this.request<{
      doctor_id: string;
      overall_score: number;
      patient_count: number;
      computed_at: string;
    }>('/doctor/compliance/overall_score/');
  }

  /**
   * List all notes for a patient. The initial interrogatory is excluded: it
   * has its own dedicated read path (`getPatient().interrogatory`, unified
   * patient view) and its own UI, so it's never part of the general notes feed.
   */
  async listNotes(
    patientId: string,
    params?: { page?: number; size?: number }
  ) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    queryParams.append('note_type_not', 'interrogation');

    const query = queryParams.toString();
    return this.request<{
      page: number;
      size: number;
      count: number;
      results: ApiNote[];
    }>(`/patients/${patientId}/notes/${query ? `?${query}` : ''}`);
  }

  /**
   * Get a specific note by ID
   */
  async getNote(patientId: string, noteId: string) {
    return this.request<ApiNote>(`/patients/${patientId}/notes/${noteId}/`);
  }

  /**
   * Create a new medical note (draft). v2.0: JSON body. Attachments are no
   * longer part of the note payload (upload via the assets endpoint).
   */
  async createNote(
    patientId: string,
    data: {
      content: string;
      note_type: string;
      title?: string;
      parent_id?: string;
      custom_date?: string;
      completeness_pct?: number;
    }
  ) {
    const body: Record<string, string | number> = {
      content: data.content,
      note_type: data.note_type,
    };
    if (data.title) body.title = data.title;
    if (data.parent_id) body.parent_id = data.parent_id;
    if (data.custom_date) body.custom_date = data.custom_date;
    if (data.completeness_pct !== undefined)
      body.completeness_pct = data.completeness_pct;
    return this.request<ApiNote>(`/patients/${patientId}/notes/`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Update a medical note (draft only). v2.0: JSON body. `custom_date` is now
   * folded into this request (the dedicated `/date/` endpoint is gone) — but
   * the backend still parses `custom_date` off a multipart form field
   * (`ParseMultipartForm` + strict `time.Parse(RFC3339, ...)`), not the JSON
   * body. A JSON request leaves that field unreadable server-side and always
   * fails with `NOTES:INVALID_PAYLOAD`, so whenever the date is being changed
   * this goes out as `multipart/form-data` instead. `custom_date` must be a
   * full RFC3339 timestamp (e.g. `date.toISOString()`), not a bare date.
   */
  async updateNote(
    patientId: string,
    noteId: string,
    data: {
      title?: string;
      content?: string;
      type?: string;
      custom_date?: string;
      completeness_pct?: number;
    }
  ) {
    const endpoint = `/patients/${patientId}/notes/${noteId}/`;
    if (data.custom_date !== undefined) {
      const formData = new FormData();
      if (data.title !== undefined) formData.append('title', data.title);
      if (data.content !== undefined) formData.append('content', data.content);
      if (data.type !== undefined) formData.append('note_type', data.type);
      if (data.completeness_pct !== undefined)
        formData.append('completeness_pct', String(data.completeness_pct));
      formData.append('custom_date', data.custom_date);
      return this.request<ApiNote>(endpoint, {
        method: 'PATCH',
        body: formData,
      });
    }
    const body: Record<string, string | number> = {};
    if (data.title !== undefined) body.title = data.title;
    if (data.content !== undefined) body.content = data.content;
    if (data.type !== undefined) body.note_type = data.type;
    if (data.completeness_pct !== undefined)
      body.completeness_pct = data.completeness_pct;
    return this.request<ApiNote>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * Sign a medical note
   */
  async signNote(patientId: string, noteId: string, save_anyway = false) {
    const path = `/patients/${patientId}/notes/${noteId}/sign/`;
    const url = save_anyway ? `${path}?save_anyway=true` : path;
    return this.request(url, {
      method: 'PATCH',
    });
  }

  /**
   * GET /patients/<id>/notes/summary/
   * SSE stream para recibir el resumen generado por un LLM.
   *
   * Nota: usamos fetch + stream porque EventSource no soporta headers (y esta API requiere auth headers).
   *
   * Contrato esperado (flexible):
   * - `data:` contiene texto incremental (delta) o JSON con { delta }.
   * - `event: done` o `data: [DONE]` indica fin.
   * - `event: error` o JSON con { error } puede indicar error.
   */
  async streamPatientNotesSummary(args: {
    patientId: string;
    signal?: AbortSignal;
    onDelta: (delta: string) => void;
    onDone?: () => void;
    onError?: (err: ApiError) => void;
  }) {
    const { patientId, signal, onDelta, onDone, onError } = args;
    const url = `${API_BASE_URL}/patients/${patientId}/notes/summary/`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
        Accept: 'text/event-stream',
      },
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: response.statusText,
      }));
      // v2.0: GET /notes/summary/ is rate-limited (5 req/IP/60h) → 429.
      const message =
        response.status === 429
          ? 'Has alcanzado el límite de resúmenes. Intenta de nuevo más tarde.'
          : errorData.message || errorData.detail || 'An error occurred';
      const apiErr = {
        message,
        status: response.status,
        errors: errorData.errors,
      } as ApiError;
      onError?.(apiErr);
      throw apiErr;
    }

    const safeDone = () => {
      try {
        onDone?.();
      } catch {
        // ignore
      }
    };

    try {
      const contentType = (
        response.headers.get('content-type') || ''
      ).toLowerCase();

      if (contentType.includes('text/event-stream')) {
        await this.consumeSseStream({
          response,
          signal,
          onMessage: ({ event, data }) => {
            if (!data && !event) return;
            if (event === 'done' || data === '[DONE]') {
              safeDone();
              return;
            }
            if (event === 'error') {
              const apiErr = {
                message: data || 'Error en SSE',
                status: 0,
              } as ApiError;
              onError?.(apiErr);
              return;
            }

            // Intentar JSON (por si el backend manda {delta}, {text}, {error}, etc)
            const trimmed = (data || '').trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                const parsed = JSON.parse(trimmed) as Record<string, unknown>;
                if (parsed?.error) {
                  const apiErr = {
                    message: String(parsed.error),
                    status: 0,
                  } as ApiError;
                  onError?.(apiErr);
                  return;
                }

                // Formato esperado observado: { type: "chunk"|"done"|"error", data: "..." }
                if (typeof parsed?.type === 'string') {
                  const t = parsed.type;
                  const d = typeof parsed?.data === 'string' ? parsed.data : '';
                  if (t === 'chunk') {
                    if (d) onDelta(d);
                    return;
                  }
                  if (t === 'done') {
                    // El evento `done` puede traer el texto completo final;
                    // no lo concatenamos (provocaría duplicado).
                    safeDone();
                    return;
                  }
                  if (t === 'error') {
                    const apiErr = {
                      message: d || 'Error en stream',
                      status: 0,
                    } as ApiError;
                    onError?.(apiErr);
                    return;
                  }
                }

                const delta = parsed?.delta ?? parsed?.text ?? parsed?.content;
                if (typeof delta === 'string' && delta.length) {
                  onDelta(delta);
                  return;
                }
                onDelta(trimmed);
                return;
              } catch {
                // si no parsea, cae a texto plano
              }
            }

            onDelta(data);
          },
        });
      } else {
        // Fallback: backend manda JSON streaming concatenado (no SSE).
        await this.consumeConcatenatedJsonObjects({
          response,
          signal,
          onObject: (obj) => {
            const o = obj as Record<string, unknown>;
            const t = typeof o?.type === 'string' ? o.type : undefined;
            const d = typeof o?.data === 'string' ? o.data : '';

            if (t === 'chunk') {
              if (d) onDelta(d);
              return;
            }
            if (t === 'done') {
              // Algunos backends mandan el texto completo en `done` como
              // confirmación final; no se concatena para no duplicar.
              safeDone();
              return;
            }
            if (t === 'error') {
              const apiErr = {
                message: d || 'Error en stream',
                status: 0,
              } as ApiError;
              onError?.(apiErr);
              return;
            }

            // Unknown object: intenta mapear campos comunes
            const delta = o?.delta ?? o?.text ?? o?.content;
            if (typeof delta === 'string' && delta.length) {
              onDelta(delta);
            }
          },
        });
      }
      safeDone();
    } catch (err: unknown) {
      if (signal?.aborted) return;
      const apiErr: ApiError =
        err && typeof err === 'object' && 'status' in err
          ? (err as ApiError)
          : ({
              message: getErrorMessage(err, 'Error de streaming'),
              status: 0,
            } as ApiError);
      onError?.(apiErr);
      throw apiErr;
    }
  }

  /**
   * Subscribe to the v2.0 Server-Sent Events stream
   * (`GET /patients/{client}/events/`, where `{client}` is the patient id).
   *
   * Long-lived connection for async notifications (e.g. when a background AI
   * analysis finishes) — the documented replacement for polling the removed
   * `GET /notes/{id}/analysis/` endpoint. Resolves when the stream ends or the
   * `signal` aborts.
   *
   * EventSource can't attach auth headers, so we use fetch + the SSE reader.
   * `data:` payloads are parsed as JSON when possible, otherwise passed through
   * as the raw string.
   */
  async subscribeEvents(args: {
    client: string;
    signal?: AbortSignal;
    onEvent: (evt: { event?: string; data: unknown }) => void;
    onError?: (err: ApiError) => void;
  }) {
    const { client, signal, onEvent, onError } = args;
    const url = `${API_BASE_URL}/patients/${encodeURIComponent(client)}/events/`;

    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
          Accept: 'text/event-stream',
        },
        signal,
      });

      if (!response.ok) {
        const apiErr = {
          message: `Events stream error (${response.status})`,
          status: response.status,
        } as ApiError;
        onError?.(apiErr);
        throw apiErr;
      }

      await this.consumeSseStream({
        response,
        signal,
        onMessage: ({ event, data }) => {
          if (!data && !event) return;
          let parsed: unknown = data;
          const trimmed = (data || '').trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              parsed = JSON.parse(trimmed);
            } catch {
              // keep raw string
            }
          }
          onEvent({ event, data: parsed });
        },
      });
    } catch (err: unknown) {
      if (signal?.aborted) return;
      const apiErr: ApiError =
        err && typeof err === 'object' && 'status' in err
          ? (err as ApiError)
          : ({
              message: getErrorMessage(err, 'Events stream error'),
              status: 0,
            } as ApiError);
      onError?.(apiErr);
      throw apiErr;
    }
  }

  // ============ ASSETS/FILES ============

  /**
   * List assets for a patient
   */
  async listPatientAssets(
    patientId: string,
    params?: { page?: number; size?: number }
  ) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.size != null)
      queryParams.append('size', params.size.toString());
    const query = queryParams.toString();

    return this.request<{
      results: Array<{
        id: string;
        mime_type: string;
        file_size: number;
        /** v2.0 filename; v1.7 returned `original_filename`. */
        filename?: string;
        original_filename?: string;
        key?: string;
        hash?: string;
      }>;
      count: number;
      page: number;
      size: number;
    }>(`/patients/${patientId}/assets/${query ? `?${query}` : ''}`);
  }

  /**
   * GET /patients/<patient_id>/assets/<asset_id>/
   * Descarga un asset como blob (raw object).
   */
  async getPatientAsset(patientId: string, assetId: string): Promise<Blob> {
    const url = `${API_BASE_URL}/patients/${patientId}/assets/${assetId}/`;
    const response = await fetchWithTimeout(url, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      throw {
        message: 'Error al descargar el asset',
        status: response.status,
      } as ApiError;
    }
    return response.blob();
  }

  /**
   * Upload files/assets for a patient (v2.0: `PUT`, was `POST`).
   * Max 30MB per file. Response items: `{ id, filename, mime_type, file_size }`.
   */
  async uploadPatientAssets(patientId: string, files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    return this.request<{
      results?: Array<{
        id: string;
        filename: string;
        mime_type: string;
        file_size: number;
      }>;
    }>(`/patients/${patientId}/assets/`, {
      method: 'PUT',
      body: formData,
    });
  }

  // ============ AUTHENTICATION ============

  private async authRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${AUTH_API_BASE_URL}${endpoint}`;

    try {
      const response = await fetchWithTimeout(url, {
        ...options,
        headers: {
          ...this.getPublicHeaders(),
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: response.statusText,
        }));
        throw {
          message: errorData.error || errorData.message || 'Request failed',
          status: response.status,
        } as ApiError;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return {} as T;
    } catch (error) {
      if (error instanceof ApiTimeoutError) {
        throw { message: error.message, status: 0 } as ApiError;
      }
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw {
        message: 'Network error or server unavailable',
        status: 0,
      } as ApiError;
    }
  }

  async login(credentials: {
    username: string;
    password: string;
    method: string;
  }) {
    return this.authRequest<{ access: string; refresh: string; id: string }>(
      '/auth/login/',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      }
    );
  }

  async requestOtp(username: string) {
    return this.authRequest<void>('/auth/otp/', {
      method: 'POST',
      body: JSON.stringify({ username, method: 'email' }),
    });
  }

  async changePassword(data: {
    code: string;
    username: string;
    password: string;
  }) {
    return this.authRequest<void>('/auth/password/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async verifyMagicLink(token: string) {
    return this.authRequest<{ access: string; refresh: string; id: string }>(
      '/auth/magiclink/verify/',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    );
  }

  // ── Bigsby: consultorios y disponibilidad semanal ───────────────────────

  async listLocations(params?: {
    page?: number;
    size?: number;
    doctor?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.size) query.set('size', String(params.size));
    if (params?.doctor) query.set('doctor', params.doctor);
    const qs = query.toString();
    return this.request<{
      results: ApiLocation[];
      count: number;
      size: number;
    }>(`${API_ENDPOINTS.LOCATIONS_LIST}${qs ? `?${qs}` : ''}`);
  }

  async createLocation(
    data: { name: string; address?: string | null },
    doctor?: string
  ) {
    return this.request<ApiLocation>(
      withDoctorScope(API_ENDPOINTS.LOCATIONS_CREATE, doctor),
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async updateLocation(
    id: string,
    data: { name?: string; address?: string | null; is_active?: boolean },
    doctor?: string
  ) {
    return this.request<ApiLocation>(
      withDoctorScope(API_ENDPOINTS.LOCATIONS_UPDATE(id), doctor),
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  async deleteLocation(id: string, doctor?: string) {
    return this.request<void>(
      withDoctorScope(API_ENDPOINTS.LOCATIONS_DELETE(id), doctor),
      {
        method: 'DELETE',
      }
    );
  }

  async listAppointmentRequests(params?: {
    page?: number;
    size?: number;
    doctor?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.size) query.set('size', String(params.size));
    if (params?.doctor) query.set('doctor', params.doctor);
    const qs = query.toString();
    return this.request<{
      results: ApiAppointmentRequest[];
      count: number;
      size: number;
    }>(`${API_ENDPOINTS.REQUESTS_LIST}${qs ? `?${qs}` : ''}`);
  }

  async decideAppointmentRequest(
    id: string,
    decision: {
      status: 'ACCEPTED' | 'DECLINED';
      patient_id?: string;
      starts_at?: string;
      duration?: string;
      location_id?: string | null;
      additional_notes?: string | null;
    },
    doctor?: string
  ) {
    return this.request<ApiAppointmentRequest>(
      withDoctorScope(API_ENDPOINTS.REQUESTS_PATCH(id), doctor),
      {
        method: 'PATCH',
        body: JSON.stringify(decision),
      }
    );
  }

  async getAvailability(doctor?: string) {
    return this.request<ApiAvailabilityConfig>(
      withDoctorScope(API_ENDPOINTS.AVAILABILITY_GET, doctor)
    );
  }

  async putAvailability(
    payload: ApiAvailabilityReplacePayload,
    doctor?: string
  ) {
    return this.request<ApiAvailabilityConfig>(
      withDoctorScope(API_ENDPOINTS.AVAILABILITY_PUT, doctor),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }
}

export interface ApiLocation {
  id: string;
  user_id: string;
  name: string;
  address?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ApiAppointmentRequest {
  id: string;
  location_id?: string | null;
  patient_phone: string;
  preferred_at?: string | null;
  notes?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  appointment_id?: string | null;
  patient_id?: string | null;
  consent_at: string;
  created_at: string;
}

export interface ApiAvailabilityWindow {
  id?: string;
  location_id?: string | null;
  location_name?: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface ApiAvailabilityBlock {
  id?: string;
  starts_at: string;
  ends_at: string;
  reason?: string | null;
  created_at?: string;
}

export interface ApiAvailabilitySettings {
  timezone: string;
  slot_duration_minutes: number;
  min_notice_hours: number;
  horizon_days: number;
}

export interface ApiAvailabilityConfig extends ApiAvailabilitySettings {
  windows: ApiAvailabilityWindow[];
  blocks: ApiAvailabilityBlock[];
}

export interface ApiAvailabilityReplacePayload {
  settings: ApiAvailabilitySettings;
  windows: Array<{
    location_id?: string | null;
    weekday: number;
    start_time: string;
    end_time: string;
  }>;
  blocks: Array<{
    starts_at: string;
    ends_at: string;
    reason?: string | null;
  }>;
}

export const apiService = new ApiService();
export default apiService;
