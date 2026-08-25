import { apiService } from '../services/api';
import { mapTableRowToPatient } from '../utils/patientTableMapper';
import type { ApiAppointment, Patient } from '../types';

/** Revalidate in background after this interval (stale-while-revalidate). */
const CACHE_TTL_MS = 2 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

function hasToken(): boolean {
  return !!localStorage.getItem('token');
}

// --- Patients ---
let patients: Patient[] = [];
let patientsCount = 0;
let patientsLoading = false;
let patientsError: string | null = null;
let patientsFetchedAt = 0;
let patientsInflight: Promise<void> | null = null;

// --- Appointments ---
let appointments: ApiAppointment[] = [];
let appointmentsCount = 0;
let appointmentsLoading = false;
let appointmentsError: string | null = null;
let appointmentsFetchedAt = 0;
let appointmentsInflight: Promise<void> | null = null;
let appointmentsInflightScope = '';
let appointmentsScope = '';

function isFresh(fetchedAt: number): boolean {
  return fetchedAt > 0 && Date.now() - fetchedAt < CACHE_TTL_MS;
}

export function subscribeClinicData(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getClinicDataSnapshot() {
  return {
    patients,
    patientsCount,
    /** True only when loading and there is no cached data to show yet. */
    patientsLoading: patientsLoading && patients.length === 0,
    patientsRevalidating: patientsLoading && patients.length > 0,
    patientsError,
    appointments,
    appointmentsCount,
    appointmentsLoading: appointmentsLoading && appointments.length === 0,
    appointmentsRevalidating: appointmentsLoading && appointments.length > 0,
    appointmentsError,
  };
}

export function upsertPatient(patient: Patient) {
  const idx = patients.findIndex((p) => p.id === patient.id);
  if (idx >= 0) {
    patients = patients.map((p, i) => (i === idx ? { ...p, ...patient } : p));
  } else {
    patients = [patient, ...patients];
    patientsCount += 1;
  }
  notify();
}

export async function loadPatients(force = false): Promise<void> {
  if (!hasToken()) {
    patientsLoading = false;
    notify();
    return;
  }
  if (!force && isFresh(patientsFetchedAt)) return;
  if (patientsInflight) return patientsInflight;

  const showSpinner = patients.length === 0;
  patientsLoading = showSpinner;
  patientsError = null;
  notify();

  patientsInflight = (async () => {
    try {
      // v2.0: GET /patients/ returns the enriched unified objects; flatten the
      // nested identity_sheet/summary into the row shape the mapper expects.
      const response = await apiService.listPatients({ size: 500 });
      const nowIso = new Date().toISOString();
      patients = response.results.map((p) =>
        mapTableRowToPatient(
          {
            id: p.id,
            slug: p.slug,
            name: p.name,
            lastname: p.lastname,
            lastname_m: p.lastname_m,
            phone: p.phone,
            birth_date: p.identity_sheet?.birthdate,
            gender: p.identity_sheet?.gender,
            blood_type: p.summary?.blood_type ?? undefined,
            is_recurrent: p.is_recurrent,
          },
          nowIso
        )
      );
      patientsCount = response.count;
      patientsFetchedAt = Date.now();
    } catch (err) {
      patientsError =
        err instanceof Error ? err.message : 'Error al cargar pacientes';
    } finally {
      patientsLoading = false;
      patientsInflight = null;
      notify();
    }
  })();

  return patientsInflight;
}

export async function loadAppointments(
  force = false,
  doctor?: string
): Promise<void> {
  if (!hasToken()) {
    appointmentsLoading = false;
    notify();
    return;
  }
  const scope = doctor?.trim() ?? '';
  if (appointmentsScope !== scope) {
    appointments = [];
    appointmentsCount = 0;
    appointmentsFetchedAt = 0;
    appointmentsError = null;
    appointmentsScope = scope;
    notify();
  }
  if (!force && isFresh(appointmentsFetchedAt)) return;
  if (appointmentsInflight) {
    if (appointmentsInflightScope === scope) return appointmentsInflight;
    await appointmentsInflight;
    return loadAppointments(force, doctor);
  }

  const showSpinner = appointments.length === 0;
  appointmentsLoading = showSpinner;
  appointmentsError = null;
  notify();

  appointmentsInflight = (async () => {
    try {
      const response = await apiService.listAppointments({
        size: 500,
        ...(scope ? { doctor: scope } : {}),
      });
      if (appointmentsScope !== scope) return;
      appointments = response.results;
      appointmentsCount = response.count;
      appointmentsFetchedAt = Date.now();
    } catch (err) {
      appointmentsError =
        err instanceof Error ? err.message : 'Error al cargar citas';
    } finally {
      appointmentsLoading = false;
      appointmentsInflight = null;
      notify();
    }
  })();
  appointmentsInflightScope = scope;

  return appointmentsInflight;
}

/** Prefetch both lists (deduped). Call after login or on app boot with token. */
export function warmClinicData(): void {
  if (!hasToken()) return;
  void loadPatients();
  void loadAppointments();
}

export function clearClinicData(): void {
  patients = [];
  patientsCount = 0;
  patientsLoading = false;
  patientsError = null;
  patientsFetchedAt = 0;
  patientsInflight = null;

  appointments = [];
  appointmentsCount = 0;
  appointmentsLoading = false;
  appointmentsError = null;
  appointmentsFetchedAt = 0;
  appointmentsInflight = null;
  appointmentsInflightScope = '';
  appointmentsScope = '';

  notify();
}

export async function refreshPatients(): Promise<void> {
  patientsFetchedAt = 0;
  return loadPatients(true);
}

export async function refreshAppointments(doctor?: string): Promise<void> {
  appointmentsFetchedAt = 0;
  return loadAppointments(true, doctor);
}
