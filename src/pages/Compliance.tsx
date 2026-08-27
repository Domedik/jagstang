import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Container,
  HStack,
  VStack,
  Text,
  Heading,
  Progress,
  Spinner,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Avatar,
  useColorModeValue,
  Input,
  InputGroup,
  InputLeftElement,
  Icon,
  Button,
  SimpleGrid,
} from '@chakra-ui/react';
import {
  FiCheckCircle,
  FiAlertTriangle,
  FiXCircle,
  FiSearch,
  FiDownload,
} from 'react-icons/fi';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import PageHead from '../components/PageHead';
import StatusBadge from '../components/StatusBadge';
import type { StatusBadgeTone } from '../components/StatusBadge';
import { usePatients } from '../hooks/usePatients';

const METRIC_LABELS: Record<string, string> = {
  profile_completeness: 'Completitud del perfil',
  initial_interrogation: 'Interrogatorio inicial',
  signed_notes_ratio: 'Notas firmadas',
  note_quality_average: 'Completitud de plantillas',
  consent_coverage: 'Cobertura de consentimientos',
  consent_freshness: 'Vigencia de consentimientos',
  timely_signing: 'Firma oportuna',
};

type ComplianceReport = {
  doctor_id: string;
  overall_score: number;
  patient_count: number;
  alert_breakdown: { critical: number; ok: number; warning: number };
  worst_metric: string;
  patients: Array<{
    patient_id: string;
    overall_score: number;
    alert_level: 'ok' | 'warning' | 'critical';
    metrics: Record<
      string,
      {
        name: string;
        score: number;
        detail: string;
        items: number;
        passing: number;
      }
    >;
    computed_at: string;
  }>;
};

type PatientNameMap = Record<string, { name: string; lastname: string }>;

type AlertFilter = 'all' | 'ok' | 'warning' | 'critical';

const Compliance: React.FC = () => {
  const navigate = useNavigate();
  const { patients } = usePatients();
  const slugById = useMemo(
    () =>
      new Map(
        patients
          .filter((p) => !!p.slug?.trim())
          .map((p) => [p.id, p.slug!.trim()] as const)
      ),
    [patients]
  );

  const cardBg = useColorModeValue('white', 'paper.800');
  const borderColor = useColorModeValue('line.light', 'whiteAlpha.200');
  const subColor = useColorModeValue('paper.700', 'paper.400');
  const metaColor = useColorModeValue('paper.600', 'paper.500');
  const rowHoverBg = useColorModeValue('paper.100', 'whiteAlpha.50');
  const stripBg = useColorModeValue('paper.50', 'whiteAlpha.50');

  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [patientNames, setPatientNames] = useState<PatientNameMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AlertFilter>('all');

  const loadReport = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    let cancelled = false;
    Promise.all([
      apiService.getDoctorCompliance(),
      apiService.listPatients({ size: 200 }),
    ])
      .then(([compliance, patients]) => {
        if (cancelled) return;
        setReport(compliance);
        const nameMap: PatientNameMap = {};
        patients.results.forEach((p) => {
          nameMap[p.id] = { name: p.name, lastname: p.lastname };
        });
        setPatientNames(nameMap);
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = loadReport();
    return cancel;
  }, [loadReport]);

  const pct = (v: number) => Math.round(v * 100);

  const scoreColor = (score: number) => {
    if (score >= 0.9) return 'success';
    if (score >= 0.7) return 'warning';
    return 'error';
  };

  const alertTone = (level: string): StatusBadgeTone => {
    switch (level) {
      case 'ok':
        return 'signed';
      case 'warning':
        return 'pending';
      case 'critical':
        return 'cancel';
      default:
        return 'neutral';
    }
  };

  const alertLabel = (level: string) => {
    switch (level) {
      case 'ok':
        return 'Cumple';
      case 'warning':
        return 'Alerta';
      case 'critical':
        return 'Crítico';
      default:
        return level;
    }
  };

  const computedAtFormatted = () => {
    if (!report?.patients?.length) return null;
    const latest = report.patients.reduce((a, b) =>
      new Date(a.computed_at) > new Date(b.computed_at) ? a : b
    );
    const d = new Date(latest.computed_at);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
  };

  const filteredPatients = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return report.patients.filter((p) => {
      if (filter !== 'all' && p.alert_level !== filter) return false;
      if (!q) return true;
      const info = patientNames[p.patient_id];
      const fullName = info ? `${info.name} ${info.lastname}` : p.patient_id;
      return fullName.toLowerCase().includes(q);
    });
  }, [report, patientNames, search, filter]);

  if (loading) {
    return (
      <Container maxW="1280px" px={{ base: 5, md: 10 }} pt={7} pb={14}>
        <PageHead crumbs="Cumplimiento" title="NOM‑004" />
        <Box display="flex" justifyContent="center" alignItems="center" py={16}>
          <Spinner size="xl" color="brand.500" thickness="3px" />
        </Box>
      </Container>
    );
  }

  if (!report) {
    return (
      <Container maxW="1280px" px={{ base: 5, md: 10 }} pt={7} pb={14}>
        <PageHead crumbs="Cumplimiento" title="NOM‑004" />
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          p={10}
          textAlign="center"
        >
          <Text color={subColor} fontSize="sm" mb={4}>
            {loadError
              ? 'No se pudo cargar el reporte de cumplimiento. Revisa tu conexión e inténtalo de nuevo.'
              : 'No hay datos de cumplimiento disponibles.'}
          </Text>
          {loadError && (
            <Button
              size="sm"
              colorScheme="brand"
              bg="brand.600"
              _hover={{ bg: 'brand.700' }}
              onClick={loadReport}
            >
              Reintentar
            </Button>
          )}
        </Box>
      </Container>
    );
  }

  const lastUpdate = computedAtFormatted();

  const FilterPill: React.FC<{
    value: AlertFilter;
    label: string;
    count?: number;
  }> = ({ value, label, count }) => {
    const active = filter === value;
    return (
      <Box
        as="button"
        onClick={() => setFilter(value)}
        px="10px"
        py="5px"
        borderRadius="999px"
        border="1px solid"
        borderColor={active ? 'text.strong' : 'border.default'}
        bg={active ? 'text.strong' : 'transparent'}
        color={active ? 'surface.card' : 'text.body'}
        fontFamily="mono"
        fontSize="11px"
        letterSpacing="0.06em"
        textTransform="uppercase"
        transition="all .12s"
        _hover={{ borderColor: active ? 'text.strong' : 'border.strong' }}
      >
        {label}
        {typeof count === 'number' && (
          <Text as="span" ml={1.5} opacity={0.7}>
            · {count}
          </Text>
        )}
      </Box>
    );
  };

  return (
    <Container maxW="1280px" px={{ base: 5, md: 10 }} pt={7} pb={14}>
      <PageHead
        crumbs="Cumplimiento"
        title="NOM‑004 · Expediente clínico"
        sub={lastUpdate ? `Última actualización · ${lastUpdate}` : undefined}
        actions={
          <Button
            size="sm"
            h="36px"
            variant="outline"
            borderColor="line.strong"
            color="text.strong"
            bg={cardBg}
            leftIcon={<FiDownload />}
            _hover={{ borderColor: 'paper.600' }}
          >
            Exportar
          </Button>
        }
      />

      {/* Top stats strip */}
      <Box
        bg={stripBg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="8px"
        mb={5}
        overflow="hidden"
      >
        <SimpleGrid
          columns={{ base: 2, md: 4 }}
          spacing={0}
          sx={{
            '> div + div': {
              borderLeft: { md: '1px solid' },
              borderLeftColor: { md: borderColor },
              borderTop: { base: '1px solid', md: 'none' },
              borderTopColor: { base: borderColor, md: 'transparent' },
            },
          }}
        >
          <StatCell
            label="Cumplimiento global"
            value={`${pct(report.overall_score)}%`}
            sub={
              <Box mt={2}>
                <Progress
                  value={pct(report.overall_score)}
                  size="xs"
                  colorScheme={scoreColor(report.overall_score)}
                  borderRadius="full"
                  bg="paper.200"
                />
              </Box>
            }
          />
          <StatCell
            label="Pacientes evaluados"
            value={report.patient_count}
            sub={
              <Text as="span" color={metaColor} fontSize="11.5px">
                Métrica más baja ·{' '}
                {METRIC_LABELS[report.worst_metric] ?? report.worst_metric}
              </Text>
            }
          />
          <StatCell
            label="En alerta"
            value={report.alert_breakdown.warning}
            sub={
              <StatusBadge tone="pending" showDot>
                Atención sugerida
              </StatusBadge>
            }
          />
          <StatCell
            label="Críticos"
            value={report.alert_breakdown.critical}
            sub={
              <StatusBadge
                tone={report.alert_breakdown.critical > 0 ? 'cancel' : 'signed'}
              >
                {report.alert_breakdown.critical > 0
                  ? 'Acción requerida'
                  : 'Sin pendientes'}
              </StatusBadge>
            }
          />
        </SimpleGrid>
      </Box>

      {/* Patient list card */}
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
          flexWrap={{ base: 'wrap', md: 'nowrap' }}
          gap={3}
        >
          <HStack spacing={3} flexWrap="wrap">
            <Heading
              as="h3"
              fontSize="14px"
              fontWeight={600}
              letterSpacing="-0.005em"
            >
              Cumplimiento por paciente
            </Heading>
            <Text
              fontFamily="mono"
              fontSize="11px"
              color={metaColor}
              letterSpacing="0.06em"
            >
              · {filteredPatients.length} DE {report.patients.length}
            </Text>
          </HStack>

          <HStack spacing={3} flexWrap="wrap">
            <HStack spacing={1.5}>
              <FilterPill
                value="all"
                label="Todos"
                count={report.patients.length}
              />
              <FilterPill
                value="ok"
                label="Cumple"
                count={report.alert_breakdown.ok}
              />
              <FilterPill
                value="warning"
                label="Alerta"
                count={report.alert_breakdown.warning}
              />
              <FilterPill
                value="critical"
                label="Crítico"
                count={report.alert_breakdown.critical}
              />
            </HStack>
            <InputGroup size="sm" w={{ base: 'full', md: '220px' }}>
              <InputLeftElement pointerEvents="none" h="32px">
                <Icon as={FiSearch} color={metaColor} />
              </InputLeftElement>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar paciente"
                h="32px"
                fontSize="13px"
                borderRadius="6px"
                borderColor="line.strong"
                _focus={{
                  borderColor: 'brand.500',
                  boxShadow: '0 0 0 3px rgba(76,183,215,0.18)',
                }}
              />
            </InputGroup>
          </HStack>
        </HStack>

        {filteredPatients.length === 0 ? (
          <Box p={10} textAlign="center">
            <Text color={subColor} fontSize="sm">
              {report.patients.length === 0
                ? 'No hay pacientes evaluados.'
                : 'Ningún paciente coincide con los filtros aplicados.'}
            </Text>
          </Box>
        ) : (
          <Accordion allowMultiple>
            {filteredPatients.map((patient) => {
              const info = patientNames[patient.patient_id];
              const fullName = info
                ? `${info.name} ${info.lastname}`
                : patient.patient_id;
              const metrics = Object.values(patient.metrics);
              const score = pct(patient.overall_score);

              return (
                <AccordionItem
                  key={patient.patient_id}
                  border="none"
                  borderBottom="1px solid"
                  borderBottomColor={borderColor}
                  sx={{ '&:last-child': { borderBottom: 'none' } }}
                >
                  <AccordionButton
                    px={{ base: 4, md: 5 }}
                    py={3}
                    _hover={{ bg: rowHoverBg }}
                  >
                    <HStack flex="1" spacing={3} minW={0}>
                      <Avatar
                        size="sm"
                        name={fullName}
                        bg="paper.200"
                        color="text.strong"
                        fontWeight={600}
                      />
                      <Box minW={0} textAlign="left">
                        <Text
                          fontWeight={500}
                          fontSize="14px"
                          color="text.strong"
                          noOfLines={1}
                          cursor="pointer"
                          _hover={{ textDecoration: 'underline' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                              `/patients/${slugById.get(patient.patient_id) ?? patient.patient_id}`
                            );
                          }}
                        >
                          {fullName}
                        </Text>
                        <Text fontSize="12px" color={metaColor} mt="1px">
                          {Object.keys(patient.metrics).length} métricas
                          evaluadas
                        </Text>
                      </Box>
                    </HStack>

                    <HStack spacing={4} flexShrink={0}>
                      <StatusBadge tone={alertTone(patient.alert_level)}>
                        {alertLabel(patient.alert_level)}
                      </StatusBadge>
                      <Text
                        fontFamily="mono"
                        fontSize="14px"
                        fontWeight={600}
                        color={`${scoreColor(patient.overall_score)}.600`}
                        minW="44px"
                        textAlign="right"
                      >
                        {score}%
                      </Text>
                      <AccordionIcon color={metaColor} />
                    </HStack>
                  </AccordionButton>

                  <AccordionPanel px={{ base: 4, md: 5 }} pb={5} pt={1}>
                    <VStack spacing={4} align="stretch">
                      {metrics.map((m) => {
                        const mPct = pct(m.score);
                        const MetricIcon =
                          m.score >= 0.9
                            ? FiCheckCircle
                            : m.score >= 0.7
                              ? FiAlertTriangle
                              : FiXCircle;
                        const iconColor =
                          m.score >= 0.9
                            ? 'success.500'
                            : m.score >= 0.7
                              ? 'warning.500'
                              : 'error.500';
                        return (
                          <Box key={m.name}>
                            <HStack justify="space-between" mb={1.5}>
                              <HStack spacing={2}>
                                <Icon
                                  as={MetricIcon}
                                  color={iconColor}
                                  boxSize={4}
                                />
                                <Text fontSize="13px" fontWeight={500}>
                                  {METRIC_LABELS[m.name] ?? m.name}
                                </Text>
                              </HStack>
                              <HStack spacing={3}>
                                <Text
                                  fontFamily="mono"
                                  fontSize="11px"
                                  color={metaColor}
                                  letterSpacing="0.04em"
                                >
                                  {m.passing}/{m.items}
                                </Text>
                                <Text
                                  fontFamily="mono"
                                  fontSize="13px"
                                  fontWeight={600}
                                  color={`${scoreColor(m.score)}.600`}
                                  minW="40px"
                                  textAlign="right"
                                >
                                  {mPct}%
                                </Text>
                              </HStack>
                            </HStack>
                            <Progress
                              value={mPct}
                              size="xs"
                              colorScheme={scoreColor(m.score)}
                              borderRadius="full"
                              bg="paper.200"
                            />
                            <Text fontSize="11.5px" color={metaColor} mt={1.5}>
                              {m.detail}
                              {m.name === 'note_quality_average' && (
                                <>
                                  {' '}
                                  Las notas basadas en formularios no se
                                  evalúan.
                                </>
                              )}
                            </Text>
                          </Box>
                        );
                      })}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </Box>
    </Container>
  );
};

interface StatCellProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}

const StatCell: React.FC<StatCellProps> = ({ label, value, sub }) => {
  const labelColor = useColorModeValue('paper.700', 'paper.400');
  return (
    <Box px={{ base: 4, md: 5 }} py={4}>
      <Text
        fontFamily="mono"
        fontSize="10.5px"
        letterSpacing="0.08em"
        textTransform="uppercase"
        color={labelColor}
        mb={1.5}
      >
        {label}
      </Text>
      <Text
        fontSize="26px"
        fontWeight={600}
        letterSpacing="-0.015em"
        lineHeight="1.1"
        color="text.strong"
      >
        {value}
      </Text>
      {sub && <Box mt={2}>{sub}</Box>}
    </Box>
  );
};

export default Compliance;
