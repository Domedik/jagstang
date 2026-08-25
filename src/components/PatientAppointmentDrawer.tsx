import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  Flex,
  HStack,
  Text,
  Icon,
  Button,
  useToast,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiUser, FiClock, FiCalendar } from 'react-icons/fi';
import FormDrawer from './FormDrawer';
import PatientColumn from './patient-appointment/PatientColumn';
import AppointmentColumn from './patient-appointment/AppointmentColumn';
import {
  freshFormState,
  freshDraft,
  freshAppt,
  type DrawerFormState,
  type PatientMode,
} from './patient-appointment/types';
import { patientFullName } from './patient-appointment/PatientSearchRow';
import type { Patient } from '../types';
import { apiService, type ApiAvailabilityConfig } from '../services/api';
import { usePatients } from '../hooks/usePatients';
import { useAppointments } from '../hooks/useAppointments';
import { phoneNumberFieldUtils } from './PhoneNumberField';
import {
  durationToApi,
  isoDate,
  parseInitialTime,
  summaryWhen,
} from '../utils/appointmentSlots';

export type PatientAppointmentEntry = 'agenda' | 'patients';

export type PatientAppointmentSuccess = {
  patientId?: string;
  /** Populated when a new patient was created in this submit. */
  patient?: Patient;
};

function patientFromCreateResponse(
  id: string,
  draft: DrawerFormState['draft'],
  created: {
    name: string;
    lastname: string;
    lastname_m?: string;
    phone?: string;
    slug?: string | null;
  },
  phoneE164?: string
): Patient {
  const now = new Date().toISOString();
  const slug =
    typeof created.slug === 'string' && created.slug.trim()
      ? created.slug.trim().replace(/^#/, '')
      : undefined;
  return {
    id,
    firstName: created.name || draft.firstName.trim(),
    lastName: created.lastname || draft.lastName.trim(),
    lastNameMaternal:
      created.lastname_m?.trim() || draft.lastNameMaternal.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    isRecurrent: false,
    ...(slug && { slug }),
    ...(phoneE164 && { phone: phoneE164 }),
  };
}

const apptRevealAnim = keyframes`
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
`;

export interface PatientAppointmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result?: PatientAppointmentSuccess) => void;
  /** Fires as soon as a new patient is created, before the appointment API runs. */
  onPatientCreated?: (patient: Patient) => void;
  entry: PatientAppointmentEntry;
  initialDate?: string;
  initialTime?: string;
  initialPatientId?: string;
  doctorScope?: string;
  availability?: ApiAvailabilityConfig | null | undefined;
  schedulingEnabled?: boolean;
  createAppointment: (
    patientId: string,
    starts_at: string,
    duration: string,
    additional_notes?: string,
    doctor?: string
  ) => Promise<void>;
}

function buildInitialState(
  entry: PatientAppointmentEntry,
  initialDate?: string,
  initialTime?: string,
  initialPatientId?: string
): DrawerFormState {
  const base = freshFormState();
  // Appointment is the primary goal in the agenda entry, so reveal it by default.
  base.apptOpen = entry === 'agenda';
  if (entry === 'patients') {
    base.patientMode = 'new';
  }
  if (initialPatientId) {
    base.patientMode = 'search';
    base.selectedPatientId = initialPatientId;
  }
  if (initialDate) {
    base.apptOpen = true;
    base.appt.dateISO = initialDate;
    const t = parseInitialTime(initialTime);
    if (t != null) base.appt.timeMin = t;
  } else if (entry === 'agenda') {
    base.appt.dateISO = isoDate(new Date());
  }
  return base;
}

const PatientAppointmentDrawer: React.FC<PatientAppointmentDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onPatientCreated,
  entry,
  initialDate,
  initialTime,
  initialPatientId,
  doctorScope,
  availability,
  schedulingEnabled = true,
  createAppointment,
}) => {
  const toast = useToast();
  const {
    patients,
    loading: loadingPatients,
    refetch: refetchPatients,
  } = usePatients();
  const { appointments, refetch: refetchAppointments } = useAppointments(
    doctorScope,
    schedulingEnabled
  );
  const [state, setState] = useState<DrawerFormState>(() =>
    buildInitialState(entry, initialDate, initialTime, initialPatientId)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const columnRuleColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.100');
  const summaryMuted = useColorModeValue('paper.700', 'paper.400');

  const lockPatient = !!initialPatientId;

  useEffect(() => {
    if (isOpen) {
      setState(
        buildInitialState(entry, initialDate, initialTime, initialPatientId)
      );
    }
  }, [isOpen, entry, initialDate, initialTime, initialPatientId]);

  const { patientMode, selectedPatientId, draft, appt, apptOpen } = state;

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  const draftValid = !!draft.firstName.trim() && !!draft.lastName.trim();

  const hasPatient = patientMode === 'new' ? draftValid : !!selectedPatientId;

  const hasWhen = apptOpen && !!appt.dateISO && appt.timeMin != null;

  /** User revealed the appointment UI — require date/time before submit. */
  const canSubmit =
    (hasPatient && hasWhen) ||
    (patientMode === 'new' && draftValid && !apptOpen);

  const submitLabel = useMemo(() => {
    if (patientMode === 'new' && hasPatient && hasWhen)
      return 'Crear y agendar';
    if (patientMode === 'new' && hasPatient && !hasWhen)
      return 'Crear paciente';
    if (hasPatient && hasWhen) return 'Agendar cita';
    return 'Guardar';
  }, [patientMode, hasPatient, hasWhen]);

  const patientSummary = useMemo(() => {
    if (!hasPatient) return 'Sin paciente';
    if (patientMode === 'new') {
      return [draft.firstName, draft.lastName].filter(Boolean).join(' ').trim();
    }
    return selectedPatient ? patientFullName(selectedPatient) : 'Sin paciente';
  }, [hasPatient, patientMode, draft, selectedPatient]);

  const whenSummary = summaryWhen(appt.dateISO, appt.timeMin) ?? 'Sin horario';

  const patientsMap = useMemo(
    () => Object.fromEntries(patients.map((p) => [p.id, p])),
    [patients]
  );

  const patientNameForSlots = useCallback(
    (id: string) => {
      const p = patientsMap[id];
      return p ? patientFullName(p) : 'Paciente';
    },
    [patientsMap]
  );

  const patchState = (patch: Partial<DrawerFormState>) =>
    setState((s) => ({ ...s, ...patch }));

  const patchDraft = (patch: Partial<DrawerFormState['draft']>) =>
    setState((s) => ({ ...s, draft: { ...s.draft, ...patch } }));

  const patchAppt = (patch: Partial<DrawerFormState['appt']>) =>
    setState((s) => ({ ...s, appt: { ...s.appt, ...patch } }));

  const openAppt = () =>
    setState((s) => ({
      ...s,
      apptOpen: true,
      appt: { ...s.appt, dateISO: s.appt.dateISO ?? isoDate(new Date()) },
    }));

  const closeAppt = () =>
    setState((s) => ({ ...s, apptOpen: false, appt: freshAppt() }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      toast({
        title: 'Completa al menos un paso',
        description:
          'Registra un paciente nuevo o elige día y hora para agendar.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (hasWhen && !hasPatient) {
      toast({
        title: 'Falta el paciente',
        description: 'Selecciona o crea un paciente antes de agendar.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (apptOpen && hasPatient && !hasWhen) {
      toast({
        title: 'Falta el horario',
        description:
          'Elige un día y una hora en el calendario para agendar la cita.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let patientId = selectedPatientId;
      let patientCreated = false;
      let createdPatient: Patient | undefined;

      if (patientMode === 'new' && draftValid) {
        const phoneE164 = phoneNumberFieldUtils.toE164(
          draft.phone.countryIso2,
          draft.phone.nationalNumber
        );
        const created = await apiService.createPatient({
          name: draft.firstName.trim(),
          lastname: draft.lastName.trim(),
          lastname_m: draft.lastNameMaternal.trim() || undefined,
          ...(phoneE164 && { phone: phoneE164 }),
        });
        patientId =
          created.id ?? (created as { patient_id?: string }).patient_id ?? null;
        if (!patientId) {
          throw new Error(
            'El paciente se registró pero no se recibió su identificador.'
          );
        }
        createdPatient = patientFromCreateResponse(
          patientId,
          draft,
          created,
          phoneE164 || undefined
        );
        patientCreated = true;
        onPatientCreated?.(createdPatient);
      }

      let appointmentCreated = false;
      if (
        hasWhen &&
        patientId &&
        appt.dateISO != null &&
        appt.timeMin != null
      ) {
        const h = Math.floor(appt.timeMin / 60);
        const m = appt.timeMin % 60;
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const localDate = new Date(`${appt.dateISO}T${timeStr}:00`);
        await createAppointment(
          patientId,
          localDate.toISOString(),
          durationToApi(appt.durationMin),
          appt.additionalNotes,
          doctorScope
        );
        appointmentCreated = true;
      }

      const who =
        patientMode === 'new'
          ? `${draft.firstName} ${draft.lastName}`.trim()
          : selectedPatient
            ? patientFullName(selectedPatient)
            : '';

      if (appointmentCreated) {
        toast({
          title: patientCreated ? 'Paciente y cita creados' : 'Cita agendada',
          description: who ? `${who} · ${whenSummary}` : whenSummary,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Paciente creado',
          description: who || 'El paciente se registró correctamente.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }

      await refetchPatients();
      await refetchAppointments();
      onClose();
      onSuccess?.({
        patientId: patientId ?? undefined,
        patient: createdPatient,
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error instanceof Error && error.message) ||
          'No se pudo completar la operación',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const patientColumn = (
    <PatientColumn
      state={state}
      patients={patients}
      loadingPatients={loadingPatients}
      hasPatient={hasPatient}
      lockPatient={lockPatient}
      allowBackToSearch={entry === 'agenda'}
      onBackToSearch={() =>
        patchState({
          patientMode: 'search',
          selectedPatientId: null,
          draft: freshDraft(),
        })
      }
      onModeChange={(mode: PatientMode) => {
        if (lockPatient && mode === 'new') return;
        patchState({
          patientMode: mode,
          ...(mode === 'new' ? { selectedPatientId: null } : {}),
        });
      }}
      onSelectPatient={(id) =>
        patchState({ selectedPatientId: id, patientMode: 'search' })
      }
      onDraftChange={patchDraft}
    />
  );

  const crumb = entry === 'agenda' ? 'Agenda · Nueva cita' : 'Pacientes';
  const title = entry === 'agenda' ? 'Registrar y agendar' : 'Nuevo paciente';
  const sub =
    entry === 'agenda'
      ? 'Elige o crea al paciente a la izquierda y resérvale un horario a la derecha.'
      : 'Registra al paciente ahora; puedes agendar una cita en el mismo paso.';

  const showFooterSummary = entry === 'agenda' || apptOpen;

  const footerLeft = (
    <HStack spacing={3} fontSize="13px" color={summaryMuted} flexWrap="wrap">
      <HStack spacing={2}>
        <Icon as={FiUser} boxSize={4} color="text.label" />
        <Text as="span" fontWeight={hasPatient ? 600 : 400} color="text.strong">
          {patientSummary}
        </Text>
      </HStack>
      <Box w="4px" h="4px" borderRadius="full" bg="paper.400" />
      <HStack spacing={2}>
        <Icon as={FiClock} boxSize={4} color="text.label" />
        <Text as="span" fontWeight={hasWhen ? 600 : 400} color="text.strong">
          {whenSummary}
        </Text>
      </HStack>
    </HStack>
  );

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      size="split"
      contentMaxW={apptOpen ? '880px' : '460px'}
      animateWidth
      bodyFillHeight
      crumb={crumb}
      title={title}
      sub={sub}
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
      submitLoadingText="Guardando…"
      isSubmitting={isSubmitting}
      isSubmitDisabled={!canSubmit}
      footerLeft={showFooterSummary ? footerLeft : undefined}
    >
      {apptOpen ? (
        <Flex
          direction={{ base: 'column', md: 'row' }}
          flex={1}
          minH={0}
          align={{ md: 'stretch' }}
          gap={{ base: 4, md: 0 }}
        >
          <Box
            flex={{ base: 'none', md: 1 }}
            minW={0}
            pr={{ md: 5 }}
            minH={{ base: 'auto', md: 0 }}
            maxH={{ base: '45vh', md: 'none' }}
            overflow="hidden"
            display="flex"
            flexDirection="column"
          >
            {patientColumn}
          </Box>
          <Box
            display={{ base: 'block', md: 'block' }}
            alignSelf="stretch"
            flexShrink={0}
            w={{ base: '100%', md: '1px' }}
            h={{ base: '1px', md: 'auto' }}
            bg={columnRuleColor}
            aria-hidden
          />
          <Box
            flex={1}
            minW={0}
            pl={{ md: 5 }}
            minH={{ base: 'auto', md: 0 }}
            overflow="hidden"
            display="flex"
            flexDirection="column"
            sx={{ animation: `${apptRevealAnim} 0.35s ease both` }}
          >
            <AppointmentColumn
              appt={appt}
              hasWhen={hasWhen}
              appointments={appointments}
              availability={availability}
              patientName={patientNameForSlots}
              onApptChange={patchAppt}
              collapsible={entry === 'patients'}
              onCollapse={closeAppt}
            />
          </Box>
        </Flex>
      ) : (
        <Flex direction="column" flex={1} minH={0} gap={4}>
          <Box flex={1} minH={0} display="flex" flexDirection="column">
            {patientColumn}
          </Box>
          <Button
            type="button"
            variant="outline"
            w="full"
            h="44px"
            borderStyle="dashed"
            borderColor="line.strong"
            color="text.strong"
            leftIcon={<Icon as={FiCalendar} boxSize={4} />}
            _hover={{ borderColor: 'brand.500', color: 'brand.600' }}
            onClick={openAppt}
          >
            Agendar cita con este paciente
          </Button>
        </Flex>
      )}
    </FormDrawer>
  );
};

export default PatientAppointmentDrawer;
