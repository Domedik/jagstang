import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  SimpleGrid,
  VStack,
  HStack,
  Text,
  Button,
  useColorModeValue,
  useDisclosure,
  Heading,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { differenceInMinutes, format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import PatientAppointmentDrawer from '../components/PatientAppointmentDrawer';
import PageHead from '../components/PageHead';
import TodayStrip from '../components/TodayStrip';
import Nudge from '../components/Nudge';
import StatusBadge from '../components/StatusBadge';
import type { StatusBadgeTone } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { usePatients } from '../hooks/usePatients';
import { useAppointments } from '../hooks/useAppointments';
import { apiService } from '../services/api';
import { normalizePatientSlug } from '../utils/patientSlug';
import { getNoteEditPath } from '../utils/notePaths';
import { COMPLIANCE_NAV_ENABLED } from '../config/features';

const WELCOME_DISMISS_KEY = 'clineo_welcome_dismissed';

interface RecentNote {
  id: string;
  title: string;
  status: string;
  type?: string;
  patient_id: string;
  patient_slug?: string;
  patient_name: string;
  patient_lastname: string;
  created_at?: string;
  accessed_at?: string;
}

interface ComplianceOverallScore {
  doctor_id: string;
  overall_score: number;
  patient_count: number;
  computed_at: string;
}

const statusToTone = (status: string): StatusBadgeTone => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'confirm';
    case 'COMPLETED':
      return 'signed';
    case 'PENDING':
      return 'pending';
    case 'CANCELLED':
      return 'cancel';
    default:
      return 'neutral';
  }
};

const statusLabel = (status: string): string => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'Confirmada';
    case 'COMPLETED':
      return 'Atendido';
    case 'PENDING':
      return 'Pendiente';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return status ?? '';
  }
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const cardBg = useColorModeValue('white', 'paper.800');
  const borderColor = useColorModeValue('line.light', 'whiteAlpha.200');
  const rowHoverBg = useColorModeValue('paper.100', 'whiteAlpha.50');
  const nowBg = useColorModeValue('statusSoft.infoBg', 'whiteAlpha.100');
  const nowHoverBg = useColorModeValue('#d9ebf0', 'whiteAlpha.200');
  const mutedColor = useColorModeValue('paper.700', 'paper.400');
  const metaColor = useColorModeValue('paper.600', 'paper.500');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { doctor } = useAuth();

  const { patients, refetch } = usePatients();
  const { appointments, createAppointment } = useAppointments();
  const [notesCount, setNotesCount] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<number>(0);
  const [draftNotes, setDraftNotes] = useState<RecentNote[]>([]);
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [showWelcome, setShowWelcome] = useState(
    () => !localStorage.getItem(WELCOME_DISMISS_KEY)
  );
  const [complianceOverall, setComplianceOverall] =
    useState<ComplianceOverallScore | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getDoctorNotesRecent({ size: 500 })
      .then((res) => {
        if (cancelled) return;
        setNotesCount(res.count);
        const mapped = res.results.map((n) => ({
          id: n.id,
          title: n.title,
          status: n.status,
          type:
            (n as { type?: string; note_type?: string }).type ??
            (n as { type?: string; note_type?: string }).note_type,
          patient_id: n.patient_id,
          patient_slug: (() => {
            const raw = (n as { patient_slug?: string | null }).patient_slug;
            const s = normalizePatientSlug(raw);
            return s || undefined;
          })(),
          patient_name: n.patient_name,
          patient_lastname: n.patient_lastname,
          created_at: n.created_at,
          accessed_at: n.accessed_at,
        }));
        setNotesDraft(mapped.filter((n) => n.status !== 'signed').length);
        setDraftNotes(mapped.filter((n) => n.status !== 'signed'));
        setRecentNotes(mapped.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) {
          setNotesCount(0);
          setNotesDraft(0);
          setDraftNotes([]);
          setRecentNotes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!COMPLIANCE_NAV_ENABLED) return;
    let cancelled = false;
    apiService
      .getDoctorComplianceOverallScore()
      .then((res) => {
        if (cancelled) return;
        setComplianceOverall(res);
      })
      .catch(() => {
        if (!cancelled) setComplianceOverall(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const compliancePct = useMemo(() => {
    if (!complianceOverall) return null;
    const raw = Number(complianceOverall.overall_score);
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw * 100);
  }, [complianceOverall]);

  const welcomeLabel = (() => {
    const name = doctor?.firstName?.trim() || '';
    const isFemale = doctor?.gender === 'female';
    if (!name) return isFemale ? 'Bienvenida' : 'Bienvenidos';
    const prefix = isFemale ? 'Dra.' : 'Dr.';
    const last = doctor?.lastName?.trim()
      ? ` ${doctor.lastName.split(' ')[0]}`
      : '';
    return `Buenos días, ${prefix}${last || ` ${name}`}`;
  })();

  const today = new Date();
  const todayKey = format(today, 'yyyy-MM-dd');

  const todayAppointments = useMemo(() => {
    return [...appointments]
      .filter(
        (apt) => format(new Date(apt.starts_at), 'yyyy-MM-dd') === todayKey
      )
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      );
  }, [appointments, todayKey]);

  const nextAppointment = useMemo(() => {
    const now = new Date();
    return (
      todayAppointments.find(
        (apt) =>
          new Date(apt.ends_at) > now &&
          apt.status?.toUpperCase() !== 'CANCELLED'
      ) ?? null
    );
  }, [todayAppointments]);

  const todayAttended = todayAppointments.filter(
    (apt) => apt.status?.toUpperCase() === 'COMPLETED'
  ).length;
  const todayRemaining = todayAppointments.length - todayAttended;

  // Heuristic: find the row closest to "now" to highlight (prototype `.now`).
  const nowRowId = useMemo(() => {
    const now = new Date();
    let bestId: string | null = null;
    let bestDiff = Infinity;
    for (const apt of todayAppointments) {
      const start = new Date(apt.starts_at).getTime();
      const end = new Date(apt.ends_at).getTime();
      const nowMs = now.getTime();
      if (nowMs >= start && nowMs <= end) return apt.id;
      const diff = Math.min(Math.abs(nowMs - start), Math.abs(nowMs - end));
      if (diff < bestDiff && apt.status?.toUpperCase() !== 'CANCELLED') {
        bestDiff = diff;
        bestId = apt.id;
      }
    }
    return bestDiff < 60 * 60 * 1000 ? bestId : null;
  }, [todayAppointments]);

  const patientById = useMemo(
    () => Object.fromEntries(patients.map((p) => [p.id, p] as const)),
    [patients]
  );

  const resolvePatientSlugForNote = (note: RecentNote): string => {
    return (
      normalizePatientSlug(note.patient_slug) ||
      normalizePatientSlug(patientById[note.patient_id]?.slug) ||
      normalizePatientSlug(note.patient_id) ||
      note.patient_id
    );
  };

  const handleReviewDrafts = () => {
    const firstDraft = draftNotes[0];
    if (!firstDraft) return;
    const patientSlug = resolvePatientSlugForNote(firstDraft);
    if (!patientSlug) {
      navigate('/patients');
      return;
    }
    navigate(getNoteEditPath(patientSlug, firstDraft.id, firstDraft.type));
  };

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_DISMISS_KEY, 'true');
    setShowWelcome(false);
  };

  const nextPatient = nextAppointment
    ? patientById[nextAppointment.patient_id]
    : null;

  const nextCitaValue = nextAppointment
    ? format(new Date(nextAppointment.starts_at), 'HH:mm')
    : '—';
  const nextCitaSub = nextAppointment
    ? `· ${nextPatient ? `${nextPatient.firstName} ${nextPatient.lastName}` : 'Paciente'}`
    : 'No hay más citas programadas';

  return (
    <Container maxW="1280px" px={{ base: 5, md: 10 }} pt={7} pb={14}>
      <PageHead
        crumbs={format(today, 'EEEE · d MMM yyyy', { locale: es })}
        title={welcomeLabel}
        sub={
          <>
            {todayAppointments.length} citas en agenda
            {notesDraft > 0 ? ` · ${notesDraft} notas sin firmar` : ''}
          </>
        }
        actions={
          <>
            <Button
              leftIcon={<FiPlus />}
              size="sm"
              h="36px"
              colorScheme="brand"
              bg="brand.600"
              color="white"
              _hover={{ bg: 'brand.700' }}
              onClick={onOpen}
            >
              Nuevo paciente
            </Button>
          </>
        }
      />

      <TodayStrip
        cells={[
          {
            label: 'Siguiente cita',
            value: nextCitaValue,
            sub: nextCitaSub,
          },
          {
            label: 'Hoy',
            value: String(todayRemaining),
            sub: `restantes · ${todayAttended} atendido${todayAttended === 1 ? '' : 's'}`,
          },
          {
            label: 'Borradores',
            value:
              notesDraft > 0 ? (
                <ChakraLink
                  color="brand.600"
                  onClick={handleReviewDrafts}
                  _hover={{ textDecoration: 'underline' }}
                >
                  {notesDraft} sin firmar
                </ChakraLink>
              ) : (
                '0'
              ),
            tone: notesDraft > 0 ? 'warn' : 'default',
          },
          ...(COMPLIANCE_NAV_ENABLED
            ? [
                {
                  label: 'Cumplimiento NOM',
                  value: compliancePct == null ? '—' : `${compliancePct}%`,
                  sub:
                    complianceOverall == null
                      ? '· sin datos'
                      : `· ${complianceOverall.patient_count} paciente${
                          complianceOverall.patient_count === 1 ? '' : 's'
                        }`,
                },
              ]
            : []),
        ]}
      />

      {showWelcome && (
        <Nudge tone="info">
          Bienvenido a Clineo. Empieza con{' '}
          <ChakraLink
            color="statusSoft.infoFg"
            fontWeight={600}
            textDecoration="underline"
            onClick={onOpen}
          >
            un paciente nuevo
          </ChakraLink>{' '}
          o revisa tu agenda de hoy.{' '}
          <ChakraLink
            color="statusSoft.infoFg"
            fontWeight={600}
            textDecoration="underline"
            onClick={dismissWelcome}
          >
            Entendido
          </ChakraLink>
        </Nudge>
      )}

      {COMPLIANCE_NAV_ENABLED && notesDraft > 0 && (
        <Nudge>
          Tienes <b>{notesDraft} notas en borrador</b>. Las notas sin firmar no
          cuentan para NOM‑004.{' '}
          <ChakraLink
            color="statusSoft.warnFg"
            fontWeight={600}
            textDecoration="underline"
            onClick={handleReviewDrafts}
          >
            Revisar y firmar →
          </ChakraLink>
        </Nudge>
      )}

      <SimpleGrid
        templateColumns={{ base: '1fr', lg: '1.4fr 1fr' }}
        spacing={5}
      >
        {/* Today's agenda — card opens full calendar; rows open patient */}
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          overflow="hidden"
          cursor="pointer"
          onClick={() => navigate('/calendar')}
          aria-label="Abrir calendario completo"
          _hover={{ borderColor: 'brand.300' }}
          transition="border-color .1s"
        >
          <HStack
            justify="space-between"
            px={{ base: 4, md: 5 }}
            py={4}
            borderBottom="1px solid"
            borderColor={borderColor}
          >
            <Heading
              as="h3"
              fontSize="14px"
              fontWeight={600}
              letterSpacing="-0.005em"
            >
              Agenda de hoy
            </Heading>
            <Text
              fontFamily="mono"
              fontSize="11px"
              color={metaColor}
              letterSpacing="0.06em"
            >
              {format(today, 'd MMM', { locale: es }).toUpperCase()} ·{' '}
              {todayAppointments.length} CITAS
            </Text>
          </HStack>
          {todayAppointments.length === 0 ? (
            <Box p={6}>
              <Text fontSize="sm" color={mutedColor} textAlign="center">
                No hay citas programadas para hoy.
              </Text>
            </Box>
          ) : (
            <VStack as="ul" spacing={0} align="stretch">
              {todayAppointments.map((apt) => {
                const p = patientById[apt.patient_id];
                const start = new Date(apt.starts_at);
                const end = new Date(apt.ends_at);
                const mins = Math.max(0, differenceInMinutes(end, start));
                const isNow = nowRowId === apt.id;
                return (
                  <HStack
                    key={apt.id}
                    as="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/patients/${normalizePatientSlug(p?.slug) || apt.patient_id}`
                      );
                    }}
                    display="grid"
                    gridTemplateColumns={{
                      base: '52px 1fr auto',
                      md: '68px 1fr auto',
                    }}
                    gap={{ base: 3, md: 4 }}
                    px={{ base: 3, md: 5 }}
                    py={3}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    bg={isNow ? nowBg : 'transparent'}
                    _hover={{ bg: isNow ? nowHoverBg : rowHoverBg }}
                    transition="background .1s"
                    textAlign="left"
                    alignItems="center"
                    sx={{ '&:last-child': { borderBottom: 'none' } }}
                  >
                    <Box
                      textAlign="right"
                      fontFamily="mono"
                      fontSize="13px"
                      fontWeight={500}
                      color="text.strong"
                    >
                      {format(start, 'HH:mm')}
                      <Text
                        as="span"
                        display="block"
                        fontSize="10.5px"
                        color={metaColor}
                        fontWeight={400}
                        mt="1px"
                      >
                        {mins} min
                      </Text>
                    </Box>
                    <Box minW={0}>
                      <Text
                        fontWeight={500}
                        fontSize="14px"
                        color="text.strong"
                      >
                        {p ? `${p.firstName} ${p.lastName}` : 'Paciente'}
                        {isNow && (
                          <Text
                            as="span"
                            ml={2}
                            fontFamily="mono"
                            fontSize="11px"
                            color={metaColor}
                            fontWeight={400}
                          >
                            · ahora
                          </Text>
                        )}
                      </Text>
                      <Text fontSize="12.5px" color={mutedColor} mt="1px">
                        {p?.isRecurrent ? 'Recurrente' : 'Primera vez'}
                      </Text>
                      {apt.additional_notes?.trim() && (
                        <Text
                          fontSize="12.5px"
                          color={mutedColor}
                          mt="1px"
                          noOfLines={2}
                        >
                          {apt.additional_notes.trim()}
                        </Text>
                      )}
                    </Box>
                    <StatusBadge tone={statusToTone(apt.status)}>
                      {statusLabel(apt.status)}
                    </StatusBadge>
                  </HStack>
                );
              })}
            </VStack>
          )}
        </Box>

        {/* Recent notes */}
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          overflow="hidden"
        >
          <HStack
            justify="space-between"
            px={{ base: 4, md: 5 }}
            py={4}
            borderBottom="1px solid"
            borderColor={borderColor}
          >
            <Heading
              as="h3"
              fontSize="14px"
              fontWeight={600}
              letterSpacing="-0.005em"
            >
              Notas recientes
            </Heading>
            <Text
              fontFamily="mono"
              fontSize="11px"
              color={metaColor}
              letterSpacing="0.06em"
            >
              {Math.min(5, notesCount ?? 0)} ÚLTIMAS
            </Text>
          </HStack>
          {recentNotes.length === 0 ? (
            <Box p={6}>
              <Text fontSize="sm" color={mutedColor} textAlign="center">
                No hay notas recientes.
              </Text>
            </Box>
          ) : (
            <VStack spacing={0} align="stretch">
              {recentNotes.map((note) => {
                const created = note.created_at
                  ? new Date(note.created_at)
                  : null;
                const isSigned = note.status === 'signed';
                const tone: StatusBadgeTone = isSigned ? 'signed' : 'draft';
                const label = isSigned
                  ? created
                    ? `Firmada · ${format(created, 'd MMM', { locale: es })}`
                    : 'Firmada'
                  : 'Borrador';
                const when = created
                  ? isSameDay(created, today)
                    ? `Creada hoy, ${format(created, 'HH:mm')}`
                    : `Creada ${format(created, 'd MMM, HH:mm', { locale: es })}`
                  : '';
                const patientSlugForUrl = resolvePatientSlugForNote(note);

                return (
                  <HStack
                    key={note.id}
                    as="button"
                    onClick={() =>
                      navigate(
                        getNoteEditPath(patientSlugForUrl, note.id, note.type)
                      )
                    }
                    display="grid"
                    gridTemplateColumns="1fr auto"
                    gap={{ base: 3, md: 4 }}
                    px={{ base: 3, md: 5 }}
                    py={3}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    _hover={{ bg: rowHoverBg }}
                    alignItems="center"
                    textAlign="left"
                    sx={{ '&:last-child': { borderBottom: 'none' } }}
                  >
                    <Box minW={0}>
                      <Text
                        fontWeight={500}
                        fontSize="13.5px"
                        color="text.strong"
                        noOfLines={1}
                      >
                        {note.title}
                      </Text>
                      {patientSlugForUrl ? (
                        <Text
                          fontFamily="mono"
                          fontSize="10.5px"
                          letterSpacing="0.06em"
                          textTransform="uppercase"
                          color={metaColor}
                          mt="2px"
                          noOfLines={1}
                        >
                          {patientSlugForUrl}
                        </Text>
                      ) : null}
                      {when && (
                        <Text fontSize="12px" color={mutedColor} mt="2px">
                          {when}
                        </Text>
                      )}
                    </Box>
                    <StatusBadge tone={tone}>{label}</StatusBadge>
                  </HStack>
                );
              })}
            </VStack>
          )}
        </Box>
      </SimpleGrid>

      <PatientAppointmentDrawer
        isOpen={isOpen}
        onClose={onClose}
        onSuccess={refetch}
        entry="patients"
        createAppointment={createAppointment}
      />
    </Container>
  );
};

export default Dashboard;
