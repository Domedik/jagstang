/** Etiquetas legibles en español para roles de Cognito / API. */
export function getRoleLabel(role: string | undefined | null): string {
  switch ((role ?? '').toUpperCase()) {
    case 'DOCTOR':
      return 'Médico';
    case 'NURSE':
      return 'Enfermera';
    case 'ASSISTANT':
      return 'Asistente';
    case 'ADMIN':
      return 'Administrador';
    case 'WELLNESS':
      return 'Wellness';
    default:
      return role?.trim() || '';
  }
}
