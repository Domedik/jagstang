import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import {
  getClinicDataSnapshot,
  loadAppointments,
  refreshAppointments,
  subscribeClinicData,
} from '../lib/clinicDataStore';

function useClinicDataTick() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeClinicData(() => setTick((n) => n + 1)), []);
}

export const useAppointments = (doctor?: string, enabled = true) => {
  useClinicDataTick();

  useEffect(() => {
    if (enabled) void loadAppointments(false, doctor);
  }, [doctor, enabled]);

  const snap = getClinicDataSnapshot();

  const createAppointment = useCallback(
    async (
      patient: string,
      starts_at: string,
      duration: string,
      additional_notes?: string,
      appointmentDoctor?: string
    ) => {
      const trimmed = additional_notes?.trim();
      const actingDoctor = appointmentDoctor ?? doctor;
      await apiService.createAppointment({
        patient,
        starts_at,
        duration,
        ...(trimmed ? { additional_notes: trimmed } : {}),
        // Asistentes de equipo: la cita va en la agenda del doctor indicado.
        ...(actingDoctor ? { doctor: actingDoctor } : {}),
      });
      await refreshAppointments(actingDoctor);
    },
    [doctor]
  );

  const updateAppointmentStatus = useCallback(
    async (
      id: string,
      status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
    ) => {
      await apiService.updateAppointmentStatus(id, status, doctor);
      await refreshAppointments(doctor);
    },
    [doctor]
  );

  const deleteAppointment = useCallback(
    async (id: string) => {
      await apiService.deleteAppointment(id, doctor);
      await refreshAppointments(doctor);
    },
    [doctor]
  );

  return {
    appointments: snap.appointments,
    count: snap.appointmentsCount,
    loading: snap.appointmentsLoading,
    error: snap.appointmentsError,
    refetch: () => refreshAppointments(doctor),
    createAppointment,
    updateAppointmentStatus,
    deleteAppointment,
  };
};
