import React, {
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from 'react';
import { flushSync } from 'react-dom';
import { upsertPatient } from '../lib/clinicDataStore';
import {
  Box,
  Container,
  Flex,
  HStack,
  VStack,
  Text,
  Heading,
  Button,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  useDisclosure,
  Avatar,
  useToast,
  useColorModeValue,
  useBreakpointValue,
  Icon,
  IconButton,
  Checkbox,
  Select,
} from '@chakra-ui/react';
import {
  FiPlus,
  FiCheck,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiClock,
  FiInbox,
} from 'react-icons/fi';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  type View,
  type ToolbarProps,
} from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  getDay,
  addDays,
  addMonths,
  startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppointments } from '../hooks/useAppointments';
import { usePatients } from '../hooks/usePatients';
import PatientAppointmentDrawer from '../components/PatientAppointmentDrawer';
import PageHead from '../components/PageHead';
import MiniCalendar from '../components/MiniCalendar';
import CalendarDayView from '../components/CalendarDayView';
import CalendarAgendaView from '../components/CalendarAgendaView';
import StatusBadge from '../components/StatusBadge';
import FormDrawer from '../components/FormDrawer';
import AvailabilityEditor from '../components/AvailabilityEditor';
import RequestsInbox from '../components/RequestsInbox';
import { useAuth } from '../contexts/AuthContext';
import type { ApiAppointment, Patient } from '../types';
import { normalizePatientSlug } from '../utils/patientSlug';
import { getErrorMessage } from '../utils/apiStatus';
import {
  apiService,
  type ApiAvailabilityConfig,
  type ApiTeamMembership,
} from '../services/api';

const locales = { es };

const CALENDAR_MIN = new Date(2000, 0, 1, 8, 0, 0);
const CALENDAR_MAX = new Date(2000, 0, 1, 22, 0, 0);

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales,
});

type ProtoView = 'day' | 'agenda' | 'week' | 'month';

function RbcEmptyToolbar(_: ToolbarProps<CalendarEvent, object>) {
  return null;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ApiAppointment & { duration: number };
}

type StatusFilter = {
  confirmed: boolean;
  pending: boolean;
  cancelled: boolean;
};

const statusTone = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'confirm' as const;
    case 'COMPLETED':
      return 'signed' as const;
    case 'PENDING':
      return 'pending' as const;
    case 'CANCELLED':
      return 'cancel' as const;
    default:
      return 'neutral' as const;
  }
};

const statusLabel = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'Confirmada';
    case 'COMPLETED':
      return 'Completada';
    case 'PENDING':
      return 'Pendiente';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return status ?? '';
  }
};

const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { doctor } = useAuth();
  // Cognito pool group is "DOCTORS"; some tokens/claims still use "DOCTOR".
  const doctorRole = (doctor?.role ?? '').toUpperCase();
  const isDoctor = doctorRole === 'DOCTOR' || doctorRole === 'DOCTORS';
  const isAssistant = doctorRole === 'ASSISTANT';
  const [memberships, setMemberships] = useState<ApiTeamMembership[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const doctorScope = isAssistant ? selectedDoctorId || undefined : undefined;
  const schedulingScopeReady = !isAssistant || !!doctorScope;
  const {
    appointments,
    createAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    refetch: refetchAppointments,
  } = useAppointments(doctorScope, schedulingScopeReady);
  const {
    patients,
    loading: patientsLoading,
    refetch: refetchPatients,
  } = usePatients();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isNewOpen,
    onOpen: onNewOpen,
    onClose: onNewClose,
  } = useDisclosure();
  const {
    isOpen: isCancelOpen,
    onOpen: onCancelOpen,
    onClose: onCancelClose,
  } = useDisclosure();
  const {
    isOpen: isAvailabilityOpen,
    onOpen: onAvailabilityOpen,
    onClose: onAvailabilityClose,
  } = useDisclosure();
  const {
    isOpen: isRequestsOpen,
    onOpen: onRequestsOpen,
    onClose: onRequestsClose,
  } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [slotDate, setSlotDate] = useState<string>('');
  const [slotTime, setSlotTime] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [initialPatientId, setInitialPatientId] = useState<string | undefined>(
    undefined
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [availability, setAvailability] = useState<
    ApiAvailabilityConfig | null | undefined
  >(undefined);

  const [view, setView] = useState<ProtoView>('day');
  const [currentDate, setCurrentDate] = useState<Date>(() =>
    startOfDay(new Date())
  );
  const [miniMonth, setMiniMonth] = useState<Date>(() => new Date());
  const [filters, setFilters] = useState<StatusFilter>({
    confirmed: true,
    pending: true,
    cancelled: true,
  });

  const cardBg = useColorModeValue('white', 'paper.800');
  const borderColor = useColorModeValue('line.light', 'whiteAlpha.200');
  const mutedColor = useColorModeValue('paper.700', 'paper.400');
  const labelColor = useColorModeValue('paper.600', 'paper.500');
  const subtleCardBg = useColorModeValue('paper.50', 'paper.800');

  const patientsMap = useMemo(
    () => Object.fromEntries(patients.map((p) => [p.id, p])),
    [patients]
  );

  useEffect(() => {
    if (!isAssistant) return;
    let cancelled = false;
    void apiService
      .listTeamMemberships()
      .then((teams) => {
        if (cancelled) return;
        setMemberships(teams);
        setSelectedDoctorId((current) => {
          if (teams.some((team) => team.doctor_id === current)) return current;
          return teams.length === 1 ? teams[0].doctor_id : '';
        });
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAssistant]);

  useEffect(() => {
    if (!schedulingScopeReady) {
      setAvailability(undefined);
      return;
    }
    let cancelled = false;
    setAvailability(undefined);
    void apiService
      .getAvailability(doctorScope)
      .then((config) => {
        if (!cancelled) setAvailability(config);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorScope, schedulingScopeReady]);

  const cachePatient = useCallback((patient: Patient) => {
    flushSync(() => {
      upsertPatient(patient);
    });
  }, []);

  const handleNewAppointmentSuccess = useCallback(async () => {
    await refetchPatients();
    onNewClose();
  }, [refetchPatients, onNewClose]);

  const patientName = (id: string) => {
    const p = patientsMap[id];
    return p ? `${p.firstName} ${p.lastName}` : 'Paciente';
  };
  const patientMeta = (id: string) => {
    const p = patientsMap[id];
    if (!p) return '';
    return p.isRecurrent ? 'Recurrente' : 'Primera vez';
  };

  const initialPatientIdFromRoute = (
    location.state as { patientId?: string } | null
  )?.patientId;

  useEffect(() => {
    if (initialPatientIdFromRoute) {
      setInitialPatientId(initialPatientIdFromRoute);
      onNewOpen();
      navigate('/calendar', { replace: true, state: {} });
    }
  }, [initialPatientIdFromRoute, onNewOpen, navigate]);

  const passesFilter = (apt: ApiAppointment) => {
    const s = apt.status?.toUpperCase();
    if (s === 'CANCELLED') return filters.cancelled;
    if (s === 'PENDING') return filters.pending;
    return filters.confirmed; // CONFIRMED / COMPLETED share the "Confirmadas" toggle
  };

  const filteredAppointments = useMemo(
    () => (schedulingScopeReady ? appointments : []).filter(passesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appointments, filters, schedulingScopeReady]
  );

  const events: CalendarEvent[] = useMemo(() => {
    return filteredAppointments.map((apt) => {
      const start = new Date(apt.starts_at);
      const end = new Date(apt.ends_at);
      const duration = Math.round((end.getTime() - start.getTime()) / 60000);
      return {
        id: apt.id,
        title: patientName(apt.patient_id),
        start,
        end,
        resource: { ...apt, duration },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAppointments, patientsMap]);

  const daysWithEvents = useMemo(() => {
    const s = new Set<string>();
    for (const apt of filteredAppointments) {
      s.add(format(new Date(apt.starts_at), 'yyyy-MM-dd'));
    }
    return s;
  }, [filteredAppointments]);

  const openEvent = (apt: ApiAppointment) => {
    const ev = events.find((e) => e.id === apt.id);
    if (ev) {
      setSelectedEvent(ev);
      onOpen();
    }
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    onOpen();
  };

  const handleNewAppointmentClick = () => {
    setSlotDate('');
    setSlotTime('');
    setInitialPatientId(undefined);
    onNewOpen();
  };

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    setSlotDate(format(slotInfo.start, 'yyyy-MM-dd'));
    setSlotTime(format(slotInfo.start, 'HH:mm'));
    setInitialPatientId(undefined);
    onNewOpen();
  };

  const handleConfirmAppointment = async () => {
    if (!selectedEvent) return;
    setIsUpdatingStatus(true);
    try {
      await updateAppointmentStatus(selectedEvent.id, 'CONFIRMED');
      toast({
        title: 'Cita confirmada',
        description: 'La cita ha sido confirmada exitosamente',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(err, 'No se pudo confirmar la cita'),
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleRequestCancelAppointment = () => {
    if (!selectedEvent) return;
    onCancelOpen();
  };

  const handleConfirmCancelAppointment = async () => {
    if (!selectedEvent) return;
    setIsCancelling(true);
    try {
      await deleteAppointment(selectedEvent.id);
      toast({
        title: 'Cita cancelada',
        description: 'La cita ha sido cancelada',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
      onCancelClose();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(err, 'No se pudo cancelar la cita'),
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const patient = selectedEvent
    ? patientsMap[selectedEvent.resource.patient_id]
    : null;

  const handleNavPrev = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, -1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, -7));
    else if (view === 'agenda') setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(addDays(currentDate, -1));
  };
  const handleNavNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, 7));
    else if (view === 'agenda') setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(addDays(currentDate, 1));
  };
  const handleToday = () => {
    const d = startOfDay(new Date());
    setCurrentDate(d);
    setMiniMonth(d);
  };

  const longDateLabel = useMemo(() => {
    if (view === 'day')
      return format(currentDate, "EEEE d 'de' MMMM", { locale: es });
    if (view === 'week') {
      const start = startOfWeek(currentDate, { locale: es, weekStartsOn: 1 });
      const end = addDays(start, 6);
      const sameMonth = start.getMonth() === end.getMonth();
      const fmtS = sameMonth ? 'd' : 'd MMM';
      return `${format(start, fmtS, { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`;
    }
    if (view === 'agenda') {
      const end = addDays(currentDate, 6);
      return `${format(currentDate, 'd MMM', { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`;
    }
    return format(currentDate, 'MMMM yyyy', { locale: es });
  }, [view, currentDate]);

  const shortDateLabel = useMemo(() => {
    if (view === 'day') return format(currentDate, 'd MMM', { locale: es });
    if (view === 'week') {
      const start = startOfWeek(currentDate, { locale: es, weekStartsOn: 1 });
      const end = addDays(start, 6);
      return `${format(start, 'd', { locale: es })}–${format(end, 'd MMM', { locale: es })}`;
    }
    if (view === 'agenda') {
      const end = addDays(currentDate, 6);
      return `${format(currentDate, 'd', { locale: es })}–${format(end, 'd MMM', { locale: es })}`;
    }
    return format(currentDate, 'MMM yyyy', { locale: es });
  }, [view, currentDate]);

  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;

  useEffect(() => {
    if (isMobile && (view === 'week' || view === 'month')) {
      setView('day');
    }
  }, [isMobile, view]);

  const viewOptions: Array<{ id: ProtoView; label: string }> = [
    { id: 'day', label: 'Día' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
  ];

  const rbcView: View = view === 'week' ? 'week' : 'month';

  const rbcEventStyle = (event: CalendarEvent) => {
    const s = event.resource.status?.toUpperCase();
    let bg = '#8890a0';
    if (s === 'CONFIRMED' || s === 'COMPLETED') bg = '#2f6b4a';
    else if (s === 'PENDING') bg = '#9a6a17';
    else if (s === 'CANCELLED') bg = '#a6392e';
    return {
      style: {
        backgroundColor: bg,
        borderRadius: '4px',
        opacity: 0.92,
        color: 'white',
        border: 'none',
        fontSize: '12px',
        padding: '3px 6px',
        fontWeight: 500,
      },
    };
  };

  return (
    <Container maxW="1280px" px={{ base: 5, md: 10 }} pt={7} pb={14}>
      <PageHead
        crumbs="Calendario"
        title="Agenda"
        sub={`Vista ${viewOptions.find((v) => v.id === view)?.label.toLowerCase() ?? ''}`}
        actions={
          <>
            {isAssistant && (
              <Select
                size="sm"
                h="36px"
                w={{ base: 'full', md: '240px' }}
                value={selectedDoctorId}
                onChange={(event) => setSelectedDoctorId(event.target.value)}
                placeholder={
                  memberships.length === 0
                    ? 'Sin equipos asignados'
                    : 'Selecciona un doctor'
                }
                isDisabled={memberships.length === 0}
                bg={cardBg}
                borderColor="line.strong"
              >
                {memberships.map((membership) => (
                  <option
                    key={membership.doctor_id}
                    value={membership.doctor_id}
                  >
                    {`${membership.doctor_name} ${membership.doctor_family_name}`.trim() ||
                      membership.doctor_id}
                  </option>
                ))}
              </Select>
            )}
            {(isDoctor || (isAssistant && schedulingScopeReady)) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  h="36px"
                  leftIcon={<FiInbox />}
                  borderColor="line.strong"
                  color="text.strong"
                  bg={cardBg}
                  onClick={onRequestsOpen}
                  _hover={{ borderColor: 'paper.600' }}
                >
                  Solicitudes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  h="36px"
                  leftIcon={<FiClock />}
                  borderColor="line.strong"
                  color="text.strong"
                  bg={cardBg}
                  onClick={onAvailabilityOpen}
                  _hover={{ borderColor: 'paper.600' }}
                >
                  Disponibilidad
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              h="36px"
              leftIcon={<FiDownload />}
              borderColor="line.strong"
              color="text.strong"
              bg={cardBg}
              isDisabled
              _hover={{ borderColor: 'paper.600' }}
            >
              Importar
            </Button>
            <Button
              leftIcon={<FiPlus />}
              size="sm"
              h="36px"
              colorScheme="brand"
              bg="brand.600"
              color="white"
              _hover={{ bg: 'brand.700' }}
              onClick={handleNewAppointmentClick}
              isDisabled={!schedulingScopeReady}
            >
              Nueva cita
            </Button>
          </>
        }
      />

      <Box
        display="grid"
        gridTemplateColumns={{ base: '1fr', lg: '260px 1fr' }}
        gap={5}
        alignItems="start"
      >
        <VStack spacing={4} align="stretch">
          <Box
            bg={cardBg}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="8px"
            p="14px"
          >
            <MiniCalendar
              month={miniMonth}
              selected={currentDate}
              daysWithEvents={daysWithEvents}
              onChangeMonth={setMiniMonth}
              onSelect={(d) => {
                setCurrentDate(d);
                setMiniMonth(d);
              }}
            />
          </Box>
          <Box
            bg={cardBg}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="8px"
          >
            <Box
              px="14px"
              py="10px"
              borderBottom="1px solid"
              borderColor={borderColor}
            >
              <Text
                fontFamily="mono"
                fontSize="10.5px"
                letterSpacing="0.08em"
                textTransform="uppercase"
                color={mutedColor}
              >
                Filtros
              </Text>
            </Box>
            <VStack align="stretch" spacing={2} p="14px">
              <Checkbox
                colorScheme="brand"
                isChecked={filters.confirmed}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, confirmed: e.target.checked }))
                }
              >
                <Text fontSize="13px">Confirmadas</Text>
              </Checkbox>
              <Checkbox
                colorScheme="brand"
                isChecked={filters.pending}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, pending: e.target.checked }))
                }
              >
                <Text fontSize="13px">Pendientes</Text>
              </Checkbox>
              <Checkbox
                colorScheme="brand"
                isChecked={filters.cancelled}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, cancelled: e.target.checked }))
                }
              >
                <Text fontSize="13px">Canceladas</Text>
              </Checkbox>
            </VStack>
          </Box>
        </VStack>

        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          overflow="hidden"
        >
          <Flex
            justify="space-between"
            align="center"
            flexWrap="wrap"
            gap={3}
            px={{ base: 3, md: '18px' }}
            py="12px"
            borderBottom="1px solid"
            borderColor={borderColor}
          >
            <HStack
              spacing={3}
              minW={0}
              flex={{ base: '1 1 auto', md: '0 1 auto' }}
            >
              <Button
                size="xs"
                h="30px"
                px="12px"
                variant="outline"
                borderColor="line.strong"
                onClick={handleToday}
              >
                Hoy
              </Button>
              <HStack spacing={1}>
                <IconButton
                  aria-label="Anterior"
                  icon={<FiChevronLeft />}
                  size="xs"
                  variant="outline"
                  w="30px"
                  h="30px"
                  borderColor="line.strong"
                  onClick={handleNavPrev}
                />
                <IconButton
                  aria-label="Siguiente"
                  icon={<FiChevronRight />}
                  size="xs"
                  variant="outline"
                  w="30px"
                  h="30px"
                  borderColor="line.strong"
                  onClick={handleNavNext}
                />
              </HStack>
              <Text
                fontSize={{ base: '13px', md: '15px' }}
                fontWeight={600}
                textTransform="capitalize"
                ml={1}
                noOfLines={1}
                display={{ base: 'none', sm: 'block' }}
              >
                {longDateLabel}
              </Text>
              <Text
                fontSize="13px"
                fontWeight={600}
                textTransform="capitalize"
                ml={1}
                noOfLines={1}
                display={{ base: 'block', sm: 'none' }}
              >
                {shortDateLabel}
              </Text>
            </HStack>
            <HStack
              spacing={0}
              border="1px solid"
              borderColor="line.strong"
              borderRadius="6px"
              overflow="hidden"
              bg={cardBg}
              flexShrink={0}
            >
              {viewOptions.map((v, i) => {
                const on = v.id === view;
                const hideOnMobile = v.id === 'week' || v.id === 'month';
                return (
                  <Box
                    key={v.id}
                    as="button"
                    onClick={() => setView(v.id)}
                    px="12px"
                    py="6px"
                    fontSize="12px"
                    fontWeight={500}
                    color={on ? 'white' : 'text.body'}
                    bg={on ? 'brand.600' : 'transparent'}
                    borderRight={
                      i < viewOptions.length - 1 ? '1px solid' : 'none'
                    }
                    borderColor="border.default"
                    _hover={
                      !on ? { bg: 'surface.hover', color: 'text.strong' } : {}
                    }
                    display={
                      hideOnMobile ? { base: 'none', md: 'block' } : 'block'
                    }
                  >
                    {v.label}
                  </Box>
                );
              })}
            </HStack>
          </Flex>

          {view === 'day' && (
            <Box maxH="680px" overflowY="auto" overscrollBehavior="contain">
              <CalendarDayView
                day={currentDate}
                appointments={filteredAppointments}
                patientName={patientName}
                patientsLoading={patientsLoading}
                onSelect={openEvent}
                startHour={0}
                endHour={24}
              />
            </Box>
          )}

          {view === 'agenda' && (
            <CalendarAgendaView
              from={currentDate}
              days={7}
              appointments={filteredAppointments}
              patientName={patientName}
              patientMeta={patientMeta}
              patientsLoading={patientsLoading}
              onSelect={openEvent}
            />
          )}

          {(view === 'week' || view === 'month') && (
            <Box
              px={{ base: 3, md: 4 }}
              py={3}
              sx={{
                '& .rbc-calendar': {
                  fontFamily: 'inherit',
                  color: 'text.body',
                  bg: 'surface.card',
                },
                '& .rbc-header': {
                  padding: '10px 4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'text.body',
                  bg: 'surface.tableHeader',
                  borderBottom: '1px solid',
                  borderColor: borderColor,
                  textTransform: 'capitalize',
                },
                '& .rbc-header + .rbc-header': {
                  borderColor: borderColor,
                },
                '& .rbc-today': { bg: 'statusSoft.infoBg' },
                '& .rbc-off-range': { color: 'text.muted' },
                '& .rbc-off-range-bg': { bg: 'surface.sunken' },
                '& .rbc-date-cell': {
                  padding: '6px 8px',
                  fontSize: '12.5px',
                  color: 'text.body',
                },
                '& .rbc-event': { padding: '3px 6px', borderRadius: '4px' },
                '& .rbc-month-view, & .rbc-time-view': {
                  border: '1px solid',
                  borderColor: borderColor,
                  borderRadius: '6px',
                  overflow: 'hidden',
                  bg: 'surface.card',
                },
                '& .rbc-day-bg, & .rbc-month-row': {
                  borderColor: borderColor,
                  bg: 'surface.card',
                },
                '& .rbc-time-header, & .rbc-time-content': {
                  bg: 'surface.card',
                  borderColor: borderColor,
                },
                '& .rbc-time-header-content, & .rbc-time-header-gutter': {
                  borderColor: borderColor,
                  bg: 'surface.card',
                },
                '& .rbc-time-gutter, & .rbc-time-gutter .rbc-timeslot-group': {
                  bg: 'surface.card',
                  borderColor: borderColor,
                },
                '& .rbc-label': {
                  color: 'text.muted',
                  fontSize: '11px',
                },
                '& .rbc-timeslot-group': {
                  borderBottom: '1px solid',
                  borderColor: borderColor,
                },
                '& .rbc-day-slot .rbc-time-slot': {
                  borderTop: '1px solid',
                  borderTopColor: borderColor,
                },
                '& .rbc-time-content > * + * > *': {
                  borderLeft: '1px solid',
                  borderLeftColor: borderColor,
                },
                '& .rbc-time-header > .rbc-row:first-child': {
                  borderBottomColor: borderColor,
                },
                '& .rbc-allday-cell': {
                  bg: 'surface.card',
                  borderColor: borderColor,
                },
                '& .rbc-current-time-indicator': {
                  bg: 'brand.400',
                },
                '& .rbc-overlay': {
                  bg: 'surface.card',
                  border: '1px solid',
                  borderColor: borderColor,
                  color: 'text.body',
                  boxShadow: 'lg',
                },
                '& .rbc-overlay-header': {
                  borderBottomColor: borderColor,
                },
              }}
            >
              <BigCalendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: 640 }}
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                selectable
                views={['month', 'week']}
                view={rbcView}
                onView={() => {
                  /* controlled by our external switch */
                }}
                date={currentDate}
                onNavigate={(d: Date) => setCurrentDate(d)}
                defaultView={rbcView}
                min={CALENDAR_MIN}
                max={CALENDAR_MAX}
                eventPropGetter={rbcEventStyle}
                culture="es"
                components={{ toolbar: RbcEmptyToolbar }}
                messages={{
                  next: 'Siguiente',
                  previous: 'Anterior',
                  today: 'Hoy',
                  month: 'Mes',
                  week: 'Semana',
                  day: 'Día',
                  agenda: 'Agenda',
                  date: 'Fecha',
                  time: 'Hora',
                  event: 'Cita',
                  noEventsInRange: 'No hay citas en este rango',
                  showMore: (total: number) => `+ Ver más (${total})`,
                }}
              />
            </Box>
          )}

          <HStack
            spacing={5}
            px="18px"
            py="12px"
            borderTop="1px solid"
            borderColor={borderColor}
            flexWrap="wrap"
          >
            <HStack spacing={2}>
              <Box w="8px" h="8px" borderRadius="full" bg="statusSoft.okFg" />
              <Text fontSize="12px" color={mutedColor}>
                Confirmada
              </Text>
            </HStack>
            <HStack spacing={2}>
              <Box w="8px" h="8px" borderRadius="full" bg="statusSoft.warnFg" />
              <Text fontSize="12px" color={mutedColor}>
                Pendiente
              </Text>
            </HStack>
            <HStack spacing={2}>
              <Box w="8px" h="8px" borderRadius="full" bg="statusSoft.critFg" />
              <Text fontSize="12px" color={mutedColor}>
                Cancelada
              </Text>
            </HStack>
          </HStack>
        </Box>
      </Box>

      <FormDrawer
        isOpen={isOpen}
        onClose={onClose}
        crumb="Agenda"
        title="Detalles de la cita"
        sub={
          selectedEvent
            ? format(selectedEvent.start, "EEEE, d 'de' MMMM 'de' yyyy", {
                locale: es,
              })
            : 'Selecciona una cita para ver el detalle.'
        }
        size="md"
        hideDefaultActions
        bodyFillHeight
      >
        {selectedEvent ? (
          <VStack align="stretch" spacing={4} flex={1} minH={0}>
            <Box
              bg={subtleCardBg}
              border="1px solid"
              borderColor={borderColor}
              borderRadius="8px"
              overflow="hidden"
            >
              <HStack
                px={4}
                py={3}
                borderBottom="1px solid"
                borderColor={borderColor}
                justify="space-between"
                align="center"
              >
                <Text
                  fontFamily="mono"
                  fontSize="10.5px"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  color={labelColor}
                  fontWeight={500}
                >
                  Paciente
                </Text>
                <StatusBadge tone={statusTone(selectedEvent.resource.status)}>
                  {statusLabel(selectedEvent.resource.status)}
                </StatusBadge>
              </HStack>
              <HStack px={4} py={4} spacing={3} align="center">
                <Avatar
                  size="sm"
                  name={
                    patient
                      ? `${patient.firstName} ${patient.lastName}`
                      : 'Paciente'
                  }
                  src={patient?.avatar}
                  bg="statusSoft.infoBg"
                  color="brand.700"
                  fontWeight={600}
                />
                <Box flex={1} minW={0}>
                  <Text
                    fontSize="14px"
                    fontWeight={600}
                    color="text.strong"
                    noOfLines={1}
                  >
                    {patient
                      ? `${patient.firstName} ${patient.lastName}`
                      : `Paciente (${selectedEvent.resource.patient_id.slice(0, 8)}…)`}
                  </Text>
                  {!patient ? (
                    <Text fontSize="11.5px" color={labelColor} mt="1px">
                      Paciente no encontrado
                    </Text>
                  ) : patient.slug?.trim() ? (
                    <Text
                      fontFamily="mono"
                      fontSize="10.5px"
                      color={labelColor}
                      letterSpacing="0.04em"
                      mt="1px"
                    >
                      {normalizePatientSlug(patient.slug).toUpperCase()}
                    </Text>
                  ) : (
                    <Text fontSize="11.5px" color={labelColor} mt="1px">
                      Primera vez
                    </Text>
                  )}
                </Box>
                <Button
                  size="xs"
                  variant="outline"
                  h="30px"
                  borderColor="line.strong"
                  color="text.strong"
                  fontWeight={500}
                  bg={cardBg}
                  isDisabled={!normalizePatientSlug(patient?.slug)}
                  onClick={() => {
                    const slug = normalizePatientSlug(patient?.slug);
                    if (slug) navigate(`/patients/${slug}`);
                    onClose();
                  }}
                >
                  Ver expediente
                </Button>
              </HStack>
            </Box>

            <Box
              bg={cardBg}
              border="1px solid"
              borderColor={borderColor}
              borderRadius="8px"
              overflow="hidden"
            >
              <Box
                px={4}
                py={3}
                borderBottom="1px solid"
                borderColor={borderColor}
              >
                <Text
                  fontFamily="mono"
                  fontSize="10.5px"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  color={labelColor}
                  fontWeight={500}
                >
                  Detalles
                </Text>
              </Box>
              <VStack align="stretch" spacing={0}>
                {[
                  {
                    label: 'Fecha',
                    value: format(
                      selectedEvent.start,
                      "EEEE, d 'de' MMMM 'de' yyyy",
                      { locale: es }
                    ),
                  },
                  {
                    label: 'Hora',
                    value: `${format(selectedEvent.start, 'HH:mm')} – ${format(
                      selectedEvent.end,
                      'HH:mm'
                    )}`,
                    mono: true,
                  },
                  {
                    label: 'Duración',
                    value: `${selectedEvent.resource.duration} minutos`,
                  },
                ].map((row, idx, arr) => (
                  <HStack
                    key={row.label}
                    justify="space-between"
                    spacing={4}
                    px={4}
                    py={3}
                    borderBottom={idx < arr.length - 1 ? '1px solid' : 'none'}
                    borderColor={borderColor}
                  >
                    <Text
                      fontFamily="mono"
                      fontSize="10.5px"
                      letterSpacing="0.06em"
                      textTransform="uppercase"
                      color={labelColor}
                      fontWeight={500}
                    >
                      {row.label}
                    </Text>
                    <Text
                      fontSize="13px"
                      fontWeight={500}
                      color="text.strong"
                      fontFamily={row.mono ? 'mono' : undefined}
                      textAlign="right"
                      noOfLines={1}
                    >
                      {row.value}
                    </Text>
                  </HStack>
                ))}
                {selectedEvent.resource.additional_notes?.trim() && (
                  <Box
                    px={4}
                    py={3}
                    borderTop="1px solid"
                    borderColor={borderColor}
                  >
                    <Text
                      fontFamily="mono"
                      fontSize="10.5px"
                      letterSpacing="0.06em"
                      textTransform="uppercase"
                      color={labelColor}
                      fontWeight={500}
                      mb={2}
                    >
                      Notas adicionales
                    </Text>
                    <Text
                      fontSize="13px"
                      color="text.strong"
                      lineHeight="1.5"
                      whiteSpace="pre-wrap"
                    >
                      {selectedEvent.resource.additional_notes?.trim()}
                    </Text>
                  </Box>
                )}
              </VStack>
            </Box>

            <Box mt="auto" pt={2}>
              <HStack spacing={2} justify="flex-end" flexWrap="wrap">
                {selectedEvent.resource.status === 'PENDING' && (
                  <Button
                    leftIcon={<Icon as={FiCheck} />}
                    size="sm"
                    h="36px"
                    bg="brand.600"
                    color="white"
                    _hover={{ bg: 'brand.700' }}
                    onClick={handleConfirmAppointment}
                    isLoading={isUpdatingStatus}
                    isDisabled={isUpdatingStatus || isCancelling}
                  >
                    Confirmar cita
                  </Button>
                )}
                {selectedEvent.resource.status !== 'CANCELLED' && (
                  <Button
                    leftIcon={<Icon as={FiX} />}
                    variant="outline"
                    size="sm"
                    h="36px"
                    borderColor="statusSoft.critBorder"
                    color="statusSoft.critFg"
                    bg="statusSoft.critBg"
                    _hover={{
                      bg: 'statusSoft.critBg',
                      borderColor: 'statusSoft.critFg',
                    }}
                    onClick={handleRequestCancelAppointment}
                    isDisabled={isUpdatingStatus || isCancelling}
                  >
                    Cancelar cita
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  h="36px"
                  borderColor="line.strong"
                  color="text.strong"
                  bg={cardBg}
                  onClick={onClose}
                >
                  Cerrar
                </Button>
              </HStack>
            </Box>
          </VStack>
        ) : (
          <VStack spacing={3} align="stretch">
            <Text fontSize="sm" color="text.body">
              No hay cita seleccionada.
            </Text>
            <Button
              variant="outline"
              size="sm"
              h="36px"
              borderColor="line.strong"
              color="text.strong"
              onClick={onClose}
              alignSelf="flex-end"
            >
              Cerrar
            </Button>
          </VStack>
        )}
      </FormDrawer>

      <AlertDialog
        isOpen={isCancelOpen}
        leastDestructiveRef={cancelRef}
        onClose={isCancelling ? () => {} : onCancelClose}
        isCentered
      >
        <AlertDialogOverlay bg="blackAlpha.600">
          <AlertDialogContent
            bg="surface.card"
            border="1px solid"
            borderColor={borderColor}
            borderRadius="12px"
            boxShadow="0 12px 40px rgba(10,11,13,.35)"
            mx={4}
          >
            <AlertDialogHeader px={6} pt={6} pb={2}>
              <Text
                as="p"
                fontFamily="mono"
                fontSize="11px"
                color="brand.fg"
                letterSpacing="0.08em"
                textTransform="uppercase"
                mb={2}
                fontWeight={500}
              >
                Agenda
              </Text>
              <Heading
                as="h2"
                fontSize="20px"
                fontWeight={600}
                letterSpacing="-0.015em"
                lineHeight="1.25"
                color="text.strong"
              >
                Cancelar cita
              </Heading>
            </AlertDialogHeader>
            <AlertDialogBody px={6} py={2}>
              <Text fontSize="14px" color="text.body" lineHeight={1.6}>
                ¿Seguro que quieres cancelar esta cita? Esta acción la marcará
                como cancelada.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter px={6} pt={4} pb={6} gap={2}>
              <Button
                ref={cancelRef}
                variant="outline"
                size="sm"
                h="36px"
                borderColor="line.strong"
                color="text.strong"
                bg={cardBg}
                _hover={{ borderColor: 'border.strong' }}
                onClick={onCancelClose}
                isDisabled={isCancelling}
              >
                Volver
              </Button>
              <Button
                size="sm"
                h="36px"
                bg="statusSoft.critFg"
                color="white"
                _hover={{ bg: 'statusSoft.critFg', opacity: 0.9 }}
                _active={{ opacity: 0.8 }}
                onClick={handleConfirmCancelAppointment}
                isLoading={isCancelling}
                loadingText="Cancelando…"
              >
                Cancelar cita
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      <PatientAppointmentDrawer
        isOpen={isNewOpen}
        onClose={onNewClose}
        onPatientCreated={cachePatient}
        onSuccess={handleNewAppointmentSuccess}
        entry="agenda"
        initialDate={slotDate}
        initialTime={slotTime}
        initialPatientId={initialPatientId}
        createAppointment={createAppointment}
        doctorScope={doctorScope}
        availability={availability}
        schedulingEnabled={schedulingScopeReady}
      />

      {(isDoctor || (isAssistant && schedulingScopeReady)) && (
        <>
          <AvailabilityEditor
            isOpen={isAvailabilityOpen}
            onClose={onAvailabilityClose}
            doctor={doctorScope}
            onSaved={setAvailability}
          />
          <RequestsInbox
            isOpen={isRequestsOpen}
            onClose={onRequestsClose}
            patients={patients}
            doctor={doctorScope}
            onAppointmentsChanged={refetchAppointments}
          />
        </>
      )}
    </Container>
  );
};

export default CalendarPage;
