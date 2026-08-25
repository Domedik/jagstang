import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import FormDrawer from './FormDrawer';
import {
  apiService,
  type ApiAppointmentRequest,
} from '../services/api';
import type { Patient } from '../types';
import { refreshAppointments } from '../lib/clinicDataStore';

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message.trim() ? err.message : fallback;

interface RequestsInboxProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
}

const toLocalDatetime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const RequestsInbox: React.FC<RequestsInboxProps> = ({
  isOpen,
  onClose,
  patients,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<ApiAppointmentRequest[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [durationMin, setDurationMin] = useState('30');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiService.listAppointmentRequests({ size: 100 });
      const pending = (resp.results ?? []).filter((r) => r.status === 'PENDING');
      setRequests(pending);
    } catch (err) {
      toast({
        title: 'No pudimos cargar solicitudes',
        description: errorText(err, 'Intenta de nuevo.'),
        status: 'error',
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isOpen) {
      setActiveId(null);
      setPatientId('');
      setStartsAt('');
      setDurationMin('30');
      void load();
    }
  }, [isOpen, load]);

  const beginAccept = (req: ApiAppointmentRequest) => {
    setActiveId(req.id);
    setPatientId('');
    setStartsAt(toLocalDatetime(req.preferred_at));
    setDurationMin('30');
  };

  const decline = async (id: string) => {
    setBusy(true);
    try {
      await apiService.decideAppointmentRequest(id, { status: 'DECLINED' });
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast({ title: 'Solicitud rechazada', status: 'info', duration: 2500 });
    } catch (err) {
      toast({
        title: 'No se pudo rechazar',
        description: errorText(err, 'Intenta de nuevo.'),
        status: 'error',
        duration: 4000,
      });
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!activeId || !patientId || !startsAt) return;
    setBusy(true);
    try {
      await apiService.decideAppointmentRequest(activeId, {
        status: 'ACCEPTED',
        patient_id: patientId,
        starts_at: new Date(startsAt).toISOString(),
        duration: `${Number(durationMin) || 30}m`,
      });
      setRequests((prev) => prev.filter((r) => r.id !== activeId));
      setActiveId(null);
      await refreshAppointments();
      toast({
        title: 'Solicitud aceptada',
        description: 'Se creó la cita en la agenda.',
        status: 'success',
        duration: 3000,
      });
    } catch (err) {
      toast({
        title: 'No se pudo aceptar',
        description: errorText(err, 'Revisa paciente y horario.'),
        status: 'error',
        duration: 5000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      crumb="Agenda"
      title="Solicitudes de cita"
      sub="Pacientes que pidieron horario desde la landing pública."
      size="md"
      hideDefaultActions
    >
      <VStack align="stretch" spacing={4} pb={4}>
        {loading ? (
          <Text fontSize="13px" color="text.label">
            Cargando…
          </Text>
        ) : requests.length === 0 ? (
          <Text fontSize="13px" color="text.label">
            No hay solicitudes pendientes.
          </Text>
        ) : (
          requests.map((req) => (
            <Box
              key={req.id}
              border="1px solid"
              borderColor="line.strong"
              borderRadius="8px"
              p={4}
            >
              <Text fontSize="14px" fontWeight={600}>
                {req.patient_phone}
              </Text>
              <Text fontSize="12px" color="text.label" mt={1}>
                Preferencia:{' '}
                {req.preferred_at
                  ? new Date(req.preferred_at).toLocaleString('es-MX')
                  : 'sin preferencia'}
              </Text>
              {req.notes ? (
                <Text fontSize="13px" mt={2}>
                  {req.notes}
                </Text>
              ) : null}

              {activeId === req.id ? (
                <VStack align="stretch" spacing={3} mt={4}>
                  <FormControl isRequired>
                    <FormLabel fontSize="12px">Paciente (expediente)</FormLabel>
                    <Select
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      placeholder="Selecciona paciente"
                    >
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.lastname}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel fontSize="12px">Inicio</FormLabel>
                    <Input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="12px">Duración (min)</FormLabel>
                    <Input
                      type="number"
                      min={5}
                      max={240}
                      value={durationMin}
                      onChange={(e) => setDurationMin(e.target.value)}
                    />
                  </FormControl>
                  <HStack>
                    <Button
                      size="sm"
                      colorScheme="brand"
                      isLoading={busy}
                      isDisabled={!patientId || !startsAt}
                      onClick={() => void accept()}
                    >
                      Confirmar cita
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActiveId(null)}
                    >
                      Cancelar
                    </Button>
                  </HStack>
                </VStack>
              ) : (
                <HStack mt={3}>
                  <Button
                    size="sm"
                    colorScheme="brand"
                    onClick={() => beginAccept(req)}
                    isDisabled={busy}
                  >
                    Aceptar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void decline(req.id)}
                    isDisabled={busy}
                  >
                    Rechazar
                  </Button>
                </HStack>
              )}
            </Box>
          ))
        )}
      </VStack>
    </FormDrawer>
  );
};

export default RequestsInbox;
