import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
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
  type ApiLocation,
} from '../services/api';
import { refreshPatients } from '../lib/clinicDataStore';
import type { Patient } from '../types';
import { phonesMatch } from '../utils/phoneMatch';

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message.trim() ? err.message : fallback;

interface RequestsInboxProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  doctor?: string;
  onAppointmentsChanged?: () => void | Promise<void>;
}

type AcceptMode = 'existing' | 'new';

const toLocalDatetime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const requestDisplayName = (req: ApiAppointmentRequest): string => {
  const parts = [req.patient_name, req.patient_lastname, req.patient_lastname_m]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  return parts.join(' ');
};

const matchPatientsByPhone = (phone: string, patients: Patient[]): Patient[] =>
  patients.filter((p) => phonesMatch(p.phone, phone));

const RequestsInbox: React.FC<RequestsInboxProps> = ({
  isOpen,
  onClose,
  patients,
  doctor,
  onAppointmentsChanged,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<ApiAppointmentRequest[]>([]);
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [acceptMode, setAcceptMode] = useState<AcceptMode>('existing');
  const [patientId, setPatientId] = useState('');
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [newName, setNewName] = useState('');
  const [newLastname, setNewLastname] = useState('');
  const [newLastnameM, setNewLastnameM] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [durationMin, setDurationMin] = useState('30');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resp, locationResp] = await Promise.all([
        apiService.listAppointmentRequests({ size: 100, doctor }),
        apiService.listLocations({ size: 100, doctor }),
      ]);
      const pending = (resp.results ?? []).filter(
        (r) => r.status === 'PENDING'
      );
      setRequests(pending);
      setLocations((locationResp.results ?? []).filter((l) => l.is_active));
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
  }, [doctor, toast]);

  useEffect(() => {
    if (isOpen) {
      setActiveId(null);
      setAcceptMode('existing');
      setPatientId('');
      setMatchedPatients([]);
      setNewName('');
      setNewLastname('');
      setNewLastnameM('');
      setNewPhone('');
      setStartsAt('');
      setDurationMin('30');
      setLocationId('');
      void load();
    }
  }, [isOpen, load]);

  const beginAccept = (req: ApiAppointmentRequest) => {
    const matches = matchPatientsByPhone(req.patient_phone, patients);
    setActiveId(req.id);
    setMatchedPatients(matches);
    setNewName((req.patient_name ?? '').trim());
    setNewLastname((req.patient_lastname ?? '').trim());
    setNewLastnameM((req.patient_lastname_m ?? '').trim());
    setNewPhone(req.patient_phone);
    setStartsAt(toLocalDatetime(req.preferred_at));
    setDurationMin('30');
    setLocationId(req.location_id ?? '');
    if (matches.length === 0) {
      setAcceptMode('new');
      setPatientId('');
    } else {
      setAcceptMode('existing');
      setPatientId(matches.length === 1 ? matches[0].id : '');
    }
  };

  const decline = async (id: string) => {
    setBusy(true);
    try {
      await apiService.decideAppointmentRequest(
        id,
        { status: 'DECLINED' },
        doctor
      );
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

  const canConfirm =
    !!activeId &&
    !!startsAt &&
    (acceptMode === 'existing'
      ? !!patientId
      : newName.trim().length > 0 && newLastname.trim().length > 0);

  const accept = async () => {
    if (!activeId || !startsAt) return;
    if (acceptMode === 'existing' && !patientId) return;
    if (acceptMode === 'new' && (!newName.trim() || !newLastname.trim())) {
      return;
    }

    setBusy(true);
    try {
      let resolvedPatientId = patientId;
      if (acceptMode === 'new') {
        const created = await apiService.createPatient({
          name: newName.trim(),
          lastname: newLastname.trim(),
          ...(newLastnameM.trim() ? { lastname_m: newLastnameM.trim() } : {}),
          ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
        });
        resolvedPatientId = created.id;
        await refreshPatients();
      }

      await apiService.decideAppointmentRequest(
        activeId,
        {
          status: 'ACCEPTED',
          patient_id: resolvedPatientId,
          starts_at: new Date(startsAt).toISOString(),
          duration: `${Number(durationMin) || 30}m`,
          ...(locationId ? { location_id: locationId } : {}),
        },
        doctor
      );
      setRequests((prev) => prev.filter((r) => r.id !== activeId));
      setActiveId(null);
      await onAppointmentsChanged?.();
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

  const selectPatients =
    matchedPatients.length > 0 ? matchedPatients : patients;

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
          <>
            {requests.map((req) => {
              const displayName = requestDisplayName(req);
              const phoneMatches = matchPatientsByPhone(
                req.patient_phone,
                patients
              );
              return (
                <Box
                  key={req.id}
                  border="1px solid"
                  borderColor="line.strong"
                  borderRadius="8px"
                  p={4}
                >
                  <Text fontSize="14px" fontWeight={600}>
                    {displayName || req.patient_phone}
                  </Text>
                  {displayName ? (
                    <Text fontSize="13px" color="text.label" mt={0.5}>
                      {req.patient_phone}
                    </Text>
                  ) : null}
                  {phoneMatches.length > 0 ? (
                    <Text fontSize="12px" color="brand.600" mt={1}>
                      Coincide con expediente
                      {phoneMatches.length === 1
                        ? `: ${phoneMatches[0].firstName} ${phoneMatches[0].lastName}`
                        : ` (${phoneMatches.length})`}
                    </Text>
                  ) : null}
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
                      <FormControl>
                        <FormLabel fontSize="12px">Paciente</FormLabel>
                        <ButtonGroup size="sm" isAttached variant="outline">
                          <Button
                            colorScheme={
                              acceptMode === 'existing' ? 'brand' : undefined
                            }
                            variant={
                              acceptMode === 'existing' ? 'solid' : 'outline'
                            }
                            onClick={() => setAcceptMode('existing')}
                          >
                            Existente
                          </Button>
                          <Button
                            colorScheme={
                              acceptMode === 'new' ? 'brand' : undefined
                            }
                            variant={acceptMode === 'new' ? 'solid' : 'outline'}
                            onClick={() => setAcceptMode('new')}
                          >
                            Crear nuevo
                          </Button>
                        </ButtonGroup>
                      </FormControl>

                      {acceptMode === 'existing' ? (
                        <FormControl isRequired>
                          <FormLabel fontSize="12px">
                            Paciente (expediente)
                          </FormLabel>
                          <Select
                            value={patientId}
                            onChange={(e) => setPatientId(e.target.value)}
                            placeholder="Selecciona paciente"
                            isDisabled={selectPatients.length === 0}
                          >
                            {selectPatients.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.firstName} {p.lastName}
                                {p.phone ? ` · ${p.phone}` : ''}
                              </option>
                            ))}
                          </Select>
                          {matchedPatients.length > 0 &&
                            matchedPatients.length < patients.length && (
                              <Button
                                mt={2}
                                size="xs"
                                variant="link"
                                onClick={() => setMatchedPatients([])}
                              >
                                Ver todos los pacientes
                              </Button>
                            )}
                        </FormControl>
                      ) : (
                        <VStack align="stretch" spacing={3}>
                          <FormControl isRequired>
                            <FormLabel fontSize="12px">Nombre</FormLabel>
                            <Input
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              maxLength={120}
                            />
                          </FormControl>
                          <FormControl isRequired>
                            <FormLabel fontSize="12px">
                              Apellido paterno
                            </FormLabel>
                            <Input
                              value={newLastname}
                              onChange={(e) => setNewLastname(e.target.value)}
                              maxLength={120}
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="12px">
                              Apellido materno
                            </FormLabel>
                            <Input
                              value={newLastnameM}
                              onChange={(e) => setNewLastnameM(e.target.value)}
                              maxLength={120}
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="12px">Teléfono</FormLabel>
                            <Input
                              value={newPhone}
                              onChange={(e) => setNewPhone(e.target.value)}
                              maxLength={32}
                            />
                          </FormControl>
                        </VStack>
                      )}

                      {(locations.length > 0 || req.location_id) && (
                        <FormControl>
                          <FormLabel fontSize="12px">Consultorio</FormLabel>
                          <Select
                            value={locationId}
                            onChange={(e) => setLocationId(e.target.value)}
                            placeholder="Sin consultorio"
                          >
                            {locations.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                      )}
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
                          isDisabled={!canConfirm}
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
              );
            })}
          </>
        )}
      </VStack>
    </FormDrawer>
  );
};

export default RequestsInbox;
