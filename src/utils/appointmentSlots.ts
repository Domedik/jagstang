import type { ApiAppointment } from '../types';
import type { ApiAvailabilityConfig } from '../services/api';

/** Legacy slot step when availability settings have not loaded yet. */
export const CLINIC = { startMin: 9 * 60, endMin: 18 * 60, step: 30 } as const;

const DOW_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function weekdayForDate(date: Date, timezone?: string): number {
  if (!timezone) return date.getDay();
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);
  return DOW_SHORT[label] ?? date.getDay();
}

export const DURATION_OPTIONS = [
  { value: 30, label: '30 min', api: '30m' },
  { value: 45, label: '45 min', api: '45m' },
  { value: 60, label: '1 hora', api: '60m' },
  { value: 90, label: '1.5 h', api: '90m' },
  { value: 120, label: '2 horas', api: '120m' },
] as const;

export const APPT_REASONS = [
  'Consulta de primera vez',
  'Seguimiento',
  'Revisión de estudios',
  'Control de crónico',
  'Certificado médico',
  'Urgencia',
] as const;

export type AppointmentSlot = {
  min: number;
  label: string;
  busy: boolean;
  who: string | null;
  step: number;
};

export function isoDate(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function minsToHHMM(m: number): string {
  return (
    String(Math.floor(m / 60)).padStart(2, '0') +
    ':' +
    String(m % 60).padStart(2, '0')
  );
}

export function hhmmToMins(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fmt12(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? 'p.m.' : 'a.m.';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

const MON = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const MON_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DOW_LONG = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function isToday(d: Date): boolean {
  return isoDate(d) === isoDate(new Date());
}

export function dayLabel(
  d: Date,
  opt?: { relative?: boolean; long?: boolean }
): string {
  const today = isoDate(d) === isoDate(new Date());
  const tomorrow = isoDate(d) === isoDate(addDays(new Date(), 1));
  if (opt?.relative && today) return 'Hoy';
  if (opt?.relative && tomorrow) return 'Mañana';
  return opt?.long ? DOW_LONG[d.getDay()] : DOW_LONG[d.getDay()].slice(0, 3);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function summaryWhen(
  dateISO: string | null,
  timeMin: number | null
): string | null {
  if (!dateISO || timeMin == null) return null;
  const d = new Date(dateISO + 'T00:00:00');
  const dl = dayLabel(d, { relative: true, long: true });
  const datePart =
    dl === 'Hoy' || dl === 'Mañana'
      ? dl
      : dl + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
  return datePart + ' · ' + fmt12(timeMin);
}

export function durationToApi(minutes: number): string {
  const found = DURATION_OPTIONS.find((d) => d.value === minutes);
  return found?.api ?? `${minutes}m`;
}

export function parseInitialTime(time?: string): number | null {
  if (!time?.trim()) return null;
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Build booked blocks for a day from API appointments + patient names map. */
function bookedForDay(
  date: Date,
  appointments: ApiAppointment[],
  patientName: (id: string) => string,
  step: number
): { s: number; e: number; who: string }[] {
  const key = isoDate(date);
  return appointments
    .filter((a) => {
      const start = new Date(a.starts_at);
      return isoDate(start) === key && a.status?.toUpperCase() !== 'CANCELLED';
    })
    .map((a) => {
      const start = new Date(a.starts_at);
      const end = new Date(a.ends_at);
      const s = start.getHours() * 60 + start.getMinutes();
      const e = end.getHours() * 60 + end.getMinutes();
      return {
        s,
        e: e > s ? e : s + step,
        who: patientName(a.patient_id),
      };
    });
}

export function slotsForDay(
  date: Date,
  appointments: ApiAppointment[],
  patientName: (id: string) => string,
  availability?: ApiAvailabilityConfig | null
): AppointmentSlot[] {
  if (availability == null) {
    return [];
  }
  const step =
    availability.slot_duration_minutes > 0
      ? availability.slot_duration_minutes
      : CLINIC.step;
  const weekday = weekdayForDate(date, availability.timezone);
  const windows = availability.windows
    .filter((window) => window.weekday === weekday)
    .map((window) => ({
      start: hhmmToMins(window.start_time),
      end: hhmmToMins(window.end_time),
    }))
    .filter((window) => window.end > window.start);
  const booked = bookedForDay(date, appointments, patientName, step);
  const blocks = (availability?.blocks ?? [])
    .map((block) => ({
      start: new Date(block.starts_at),
      end: new Date(block.ends_at),
    }))
    .filter(
      (block) =>
        !Number.isNaN(block.start.getTime()) &&
        !Number.isNaN(block.end.getTime())
    );
  const minBookTime =
    Date.now() + availability.min_notice_hours * 60 * 60 * 1000;
  const horizonEnd = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate() + availability.horizon_days + 1
  ).getTime();
  const slots: AppointmentSlot[] = [];
  const seen = new Set<number>();
  for (const window of windows) {
    for (let m = window.start; m + step <= window.end; m += step) {
      if (seen.has(m)) continue;
      seen.add(m);
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(m / 60), m % 60, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + step * 60000);
      const blocked = blocks.some(
        (block) => slotStart < block.end && slotEnd > block.start
      );
      const outsideBookingWindow =
        (minBookTime != null && slotStart.getTime() < minBookTime) ||
        (horizonEnd != null && slotStart.getTime() >= horizonEnd);
      const hit = booked.find((b) => m < b.e && m + step > b.s);
      slots.push({
        min: m,
        label: minsToHHMM(m),
        busy: blocked || outsideBookingWindow || !!hit,
        who:
          blocked || outsideBookingWindow
            ? 'No disponible'
            : hit
              ? hit.who
              : null,
        step,
      });
    }
  }
  return slots.sort((a, b) => a.min - b.min);
}

export function isSlotFree(
  slots: AppointmentSlot[],
  slotIndex: number,
  durationMin: number
): boolean {
  const first = slots[slotIndex];
  if (!first || first.busy) return false;
  const targetEnd = first.min + durationMin;
  let coveredUntil = first.min;
  for (let k = slotIndex; coveredUntil < targetEnd; k++) {
    const slot = slots[k];
    if (!slot || slot.busy || slot.min !== coveredUntil) return false;
    coveredUntil = slot.min + slot.step;
  }
  return coveredUntil >= targetEnd;
}

export function appointmentCountByDay(
  appointments: ApiAppointment[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of appointments) {
    if (a.status?.toUpperCase() === 'CANCELLED') continue;
    const key = isoDate(new Date(a.starts_at));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function formatDayTimelineTitle(date: Date): string {
  return (
    dayLabel(date, { long: true }) +
    ', ' +
    date.getDate() +
    ' ' +
    MON_LONG[date.getMonth()]
  );
}

export { MON, MON_LONG };
