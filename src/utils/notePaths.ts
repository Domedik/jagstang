import { normalizePatientSlug } from './patientSlug';

/** Tipos de nota que usan el editor de formulario dedicado. */
const FORM_NOTE_TYPES = new Set(['form', 'form_note', 'custom_form']);

export function isFormNoteType(type?: string | null): boolean {
  if (!type) return false;
  return FORM_NOTE_TYPES.has(type.toLowerCase());
}

export function getNoteEditPath(
  patientSlug: string,
  noteId: string,
  noteType?: string | null
): string {
  const slug = normalizePatientSlug(patientSlug);
  const segment = isFormNoteType(noteType) ? 'edit-form' : 'edit';
  return `/patients/${slug}/notes/${noteId}/${segment}`;
}
