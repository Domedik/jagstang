import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Container,
  Text,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Avatar,
  useColorModeValue,
  Icon,
  useDisclosure,
  Spinner,
  Alert,
  AlertIcon,
  VStack,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Divider,
} from '@chakra-ui/react';
import {
  FiPlus,
  FiSearch,
  FiMail,
  FiPhone,
  FiMoreVertical,
  FiEdit,
  FiExternalLink,
  FiChevronUp,
  FiChevronDown,
  FiCheck,
  FiFilter,
  FiX,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PatientFormModal from '../components/PatientFormModal';
import PatientAppointmentDrawer from '../components/PatientAppointmentDrawer';
import PageHead from '../components/PageHead';
import StatusBadge from '../components/StatusBadge';
import TablePagination from '../components/TablePagination';
import { usePatients } from '../hooks/usePatients';
import { useAppointments } from '../hooks/useAppointments';
import { useAuth } from '../contexts/AuthContext';
import type { Patient } from '../types';

const calcAge = (dob?: string): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return Math.max(0, age);
};

const genderInitial = (g?: string): string => {
  if (g === 'male') return 'M';
  if (g === 'female') return 'F';
  if (g) return 'O';
  return '';
};

type PatientSortKey = 'name' | 'age' | 'gender' | 'isRecurrent' | 'lastVisit';
type SortDir = 'asc' | 'desc';
type RecurrentFilter = 'all' | 'recurrent' | 'first';
type GenderFilter = 'all' | 'male' | 'female' | 'other';

interface FilterSectionProps<T extends string> {
  title: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  labelColor: string;
  inkStrong: string;
  subColor: string;
}

function FilterSection<T extends string>({
  title,
  options,
  value,
  onChange,
  labelColor,
  inkStrong,
  subColor,
}: FilterSectionProps<T>) {
  return (
    <Box px={3} py={2.5}>
      <Text
        fontSize="10.5px"
        fontFamily="mono"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color={labelColor}
        mb={1.5}
      >
        {title}
      </Text>
      <VStack align="stretch" spacing={0.5}>
        {options.map((opt) => {
          const on = value === opt.id;
          return (
            <Box
              key={opt.id}
              as="button"
              type="button"
              onClick={() => onChange(opt.id)}
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              w="full"
              px={2}
              py={1.5}
              borderRadius="6px"
              fontSize="13px"
              fontWeight={on ? 600 : 400}
              color={on ? inkStrong : subColor}
              textAlign="left"
              _hover={{ bg: 'blackAlpha.50', _dark: { bg: 'whiteAlpha.100' } }}
              transition="background 0.12s ease"
            >
              <Text as="span">{opt.label}</Text>
              {on && <Icon as={FiCheck} boxSize={3.5} color="brand.500" />}
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

const PatientList: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [recurrentFilter, setRecurrentFilter] =
    useState<RecurrentFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [sortKey, setSortKey] = useState<PatientSortKey>('lastVisit');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const navigate = useNavigate();
  const { doctor } = useAuth();
  // El equipo (nurse) puede ver/actualizar pacientes pero no crearlos:
  // el backend rechaza el alta y solo el doctor "dueño" puede darla de alta.
  const canCreatePatient = (doctor?.role ?? '').toUpperCase() !== 'NURSE';

  const cardBg = useColorModeValue('white', 'paper.800');
  const borderColor = useColorModeValue('line.light', 'whiteAlpha.200');
  const rowHoverBg = useColorModeValue('paper.100', 'whiteAlpha.50');
  const headerBg = useColorModeValue('paper.100', 'whiteAlpha.50');
  const labelColor = useColorModeValue('paper.600', 'paper.500');
  const subColor = useColorModeValue('paper.700', 'paper.400');
  const inkStrong = useColorModeValue('paper.900', 'paper.50');

  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onClose: onCreateClose,
  } = useDisclosure();
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onClose: onEditClose,
  } = useDisclosure();
  const [editingPatientId, setEditingPatientId] = useState<
    string | undefined
  >();

  const { patients, loading, error, refetch } = usePatients();
  const { createAppointment } = useAppointments();

  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const bySearch = q
      ? patients.filter(
          (p) =>
            p.firstName?.toLowerCase().includes(q) ||
            p.lastName?.toLowerCase().includes(q) ||
            p.lastNameMaternal?.toLowerCase().includes(q) ||
            p.email?.toLowerCase().includes(q) ||
            p.phone?.includes(q)
        )
      : patients;

    const byRecurrent =
      recurrentFilter === 'all'
        ? bySearch
        : bySearch.filter((p) =>
            recurrentFilter === 'recurrent' ? !!p.isRecurrent : !p.isRecurrent
          );

    const byGender =
      genderFilter === 'all'
        ? byRecurrent
        : byRecurrent.filter((p) => {
            if (genderFilter === 'other') {
              return !!p.gender && p.gender !== 'male' && p.gender !== 'female';
            }
            return p.gender === genderFilter;
          });

    const compare = (a: Patient, b: Patient): number => {
      switch (sortKey) {
        case 'name': {
          const aName =
            `${a.firstName ?? ''} ${a.lastName ?? ''} ${a.lastNameMaternal ?? ''}`
              .trim()
              .toLowerCase();
          const bName =
            `${b.firstName ?? ''} ${b.lastName ?? ''} ${b.lastNameMaternal ?? ''}`
              .trim()
              .toLowerCase();
          return aName.localeCompare(bName, 'es');
        }
        case 'age': {
          const aAge = calcAge(a.dateOfBirth);
          const bAge = calcAge(b.dateOfBirth);
          const av = aAge ?? -1;
          const bv = bAge ?? -1;
          return av - bv;
        }
        case 'gender': {
          const rank = (g?: Patient['gender']): number => {
            if (g === 'female') return 2;
            if (g === 'male') return 1;
            if (g) return 0; // other / prefer_not_to_say
            return -1;
          };
          return rank(a.gender) - rank(b.gender);
        }
        case 'isRecurrent': {
          const av = a.isRecurrent ? 1 : 0;
          const bv = b.isRecurrent ? 1 : 0;
          return av - bv;
        }
        case 'lastVisit': {
          const aTime = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
          const bTime = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
          return aTime - bTime;
        }
        default:
          return 0;
      }
    };

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...byGender].sort((a, b) => dir * compare(a, b));
  }, [patients, searchQuery, recurrentFilter, genderFilter, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, recurrentFilter, genderFilter, sortKey, sortDir]);

  const pagedPatients = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPatients.slice(start, start + pageSize);
  }, [filteredPatients, page, pageSize]);

  const toggleSort = (key: PatientSortKey) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir(key === 'name' ? 'asc' : 'desc');
        return key;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return prev;
    });
  };

  const sortIconFor = (key: PatientSortKey) => {
    const isActive = sortKey === key;
    const icon = isActive
      ? sortDir === 'asc'
        ? FiChevronUp
        : FiChevronDown
      : FiChevronDown;
    return (
      <Icon
        as={icon}
        boxSize={3.5}
        opacity={isActive ? 1 : 0.35}
        transition="opacity .12s"
      />
    );
  };

  const RECURRENT_FILTERS: Array<{ id: RecurrentFilter; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'recurrent', label: 'Recurrente' },
    { id: 'first', label: 'Primera vez' },
  ];
  const GENDER_FILTERS: Array<{ id: GenderFilter; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'female', label: 'Femenino' },
    { id: 'male', label: 'Masculino' },
    { id: 'other', label: 'Otro' },
  ];

  const activeFilterCount =
    (recurrentFilter !== 'all' ? 1 : 0) + (genderFilter !== 'all' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const clearAllFilters = () => {
    setRecurrentFilter('all');
    setGenderFilter('all');
  };

  const handleEdit = (e: React.MouseEvent, patient: Patient) => {
    e.stopPropagation();
    setEditingPatientId(patient.id);
    onEditOpen();
  };

  return (
    <Container maxW="1280px" px={{ base: 5, md: 10 }} pt={7} pb={14}>
      <PageHead
        crumbs={<>Pacientes</>}
        title="Pacientes"
        sub={
          loading
            ? 'Cargando…'
            : `${filteredPatients.length} ${
                filteredPatients.length === 1 ? 'paciente' : 'pacientes'
              }${searchQuery ? ' encontrados' : ' en tu lista'}`
        }
        actions={
          <>
            <InputGroup size="sm" w={{ base: 'full', md: '260px' }}>
              <InputLeftElement pointerEvents="none" h="36px">
                <Icon as={FiSearch} color={labelColor} boxSize={4} />
              </InputLeftElement>
              <Input
                h="36px"
                placeholder="Buscar paciente…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                bg={cardBg}
                borderColor="line.strong"
                color={inkStrong}
                _placeholder={{ color: labelColor }}
                _hover={{ borderColor: 'paper.600' }}
                _focus={{
                  borderColor: 'brand.500',
                  boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)',
                }}
                fontSize="13px"
                borderRadius="6px"
              />
            </InputGroup>
            <Popover isLazy placement="bottom-end" gutter={6}>
              <PopoverTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  h="36px"
                  px={3}
                  borderRadius="6px"
                  borderColor={hasActiveFilters ? inkStrong : 'line.strong'}
                  bg={cardBg}
                  color={inkStrong}
                  fontWeight={500}
                  fontSize="13px"
                  leftIcon={<Icon as={FiFilter} boxSize={3.5} />}
                  _hover={{ borderColor: 'paper.600' }}
                  _active={{ bg: cardBg }}
                  aria-label="Filtros"
                >
                  <HStack as="span" spacing={1.5}>
                    <Text as="span">Filtros</Text>
                    {hasActiveFilters && (
                      <Box
                        as="span"
                        display="inline-flex"
                        alignItems="center"
                        justifyContent="center"
                        minW="18px"
                        h="18px"
                        px={1.5}
                        borderRadius="999px"
                        bg="brand.600"
                        color="white"
                        fontSize="10.5px"
                        fontWeight={700}
                        lineHeight={1}
                      >
                        {activeFilterCount}
                      </Box>
                    )}
                  </HStack>
                </Button>
              </PopoverTrigger>
              <PopoverContent w="260px">
                <PopoverBody p={0}>
                  <FilterSection
                    title="Estado"
                    options={RECURRENT_FILTERS}
                    value={recurrentFilter}
                    onChange={(v) => setRecurrentFilter(v as RecurrentFilter)}
                    labelColor={labelColor}
                    inkStrong={inkStrong}
                    subColor={subColor}
                  />
                  <Divider borderColor={borderColor} />
                  <FilterSection
                    title="Sexo"
                    options={GENDER_FILTERS}
                    value={genderFilter}
                    onChange={(v) => setGenderFilter(v as GenderFilter)}
                    labelColor={labelColor}
                    inkStrong={inkStrong}
                    subColor={subColor}
                  />
                  {hasActiveFilters && (
                    <>
                      <Divider borderColor={borderColor} />
                      <HStack px={3} py={2} justify="flex-end">
                        <Button
                          size="xs"
                          variant="ghost"
                          leftIcon={<Icon as={FiX} boxSize={3} />}
                          color={subColor}
                          fontWeight={500}
                          onClick={clearAllFilters}
                          _hover={{ color: inkStrong, bg: rowHoverBg }}
                        >
                          Limpiar filtros
                        </Button>
                      </HStack>
                    </>
                  )}
                </PopoverBody>
              </PopoverContent>
            </Popover>
            {canCreatePatient && (
              <Button
                leftIcon={<FiPlus />}
                size="sm"
                h="36px"
                colorScheme="brand"
                bg="brand.600"
                color="white"
                _hover={{ bg: 'brand.700' }}
                onClick={() => {
                  setEditingPatientId(undefined);
                  onCreateOpen();
                }}
              >
                Nuevo paciente
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          py={12}
        >
          <VStack spacing={4}>
            <Spinner size="lg" color="brand.500" />
            <Text color={subColor} fontSize="sm">
              Cargando pacientes…
            </Text>
          </VStack>
        </Box>
      ) : error ? (
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <VStack align="start" spacing={1}>
            <Text fontWeight="semibold">Error al cargar pacientes</Text>
            <Text fontSize="sm">{error}</Text>
          </VStack>
        </Alert>
      ) : filteredPatients.length === 0 ? (
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          py={16}
          px={6}
        >
          <VStack spacing={3}>
            <Text fontSize="md" fontWeight={600} color={inkStrong}>
              No se encontraron pacientes
            </Text>
            <Text fontSize="sm" color={subColor} textAlign="center">
              {searchQuery
                ? 'Intenta con otro término de búsqueda.'
                : canCreatePatient
                  ? 'Agrega tu primer paciente para comenzar.'
                  : 'Aún no hay pacientes asignados a tu equipo.'}
            </Text>
            {!searchQuery && canCreatePatient && (
              <Button
                leftIcon={<FiPlus />}
                size="sm"
                mt={2}
                colorScheme="brand"
                bg="brand.600"
                color="white"
                _hover={{ bg: 'brand.700' }}
                onClick={() => {
                  setEditingPatientId(undefined);
                  onCreateOpen();
                }}
              >
                Nuevo paciente
              </Button>
            )}
          </VStack>
        </Box>
      ) : (
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          overflow="hidden"
        >
          <Box overflowX="auto">
            <Table variant="unstyled" size="sm">
              <Thead bg={headerBg}>
                <Tr>
                  <Th
                    py={2.5}
                    px={4}
                    fontFamily="mono"
                    fontSize="10.5px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={labelColor}
                    fontWeight={500}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    minW="180px"
                  >
                    <HStack spacing={1.5} justify="space-between">
                      <Box as="button" onClick={() => toggleSort('name')}>
                        <HStack spacing={1.5}>
                          <Text as="span">Paciente</Text>
                          {sortIconFor('name')}
                        </HStack>
                      </Box>
                    </HStack>
                  </Th>
                  <Th
                    py={2.5}
                    px={4}
                    fontFamily="mono"
                    fontSize="10.5px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={labelColor}
                    fontWeight={500}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    display={{ base: 'none', md: 'table-cell' }}
                  >
                    <Box as="button" onClick={() => toggleSort('age')}>
                      <HStack spacing={1.5}>
                        <Text as="span">Edad</Text>
                        {sortIconFor('age')}
                      </HStack>
                    </Box>
                  </Th>
                  <Th
                    py={2.5}
                    px={4}
                    fontFamily="mono"
                    fontSize="10.5px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={labelColor}
                    fontWeight={500}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    display={{ base: 'none', md: 'table-cell' }}
                    textAlign="center"
                  >
                    <Box
                      as="button"
                      onClick={() => toggleSort('gender')}
                      display="inline-flex"
                      justifyContent="center"
                      w="full"
                    >
                      <HStack spacing={1.5}>
                        <Text as="span">Género</Text>
                        {sortIconFor('gender')}
                      </HStack>
                    </Box>
                  </Th>
                  <Th
                    py={2.5}
                    px={4}
                    fontFamily="mono"
                    fontSize="10.5px"
                    letterSpacing="0.08em"
                    textTransform="none"
                    color={labelColor}
                    fontWeight={500}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    display={{ base: 'none', lg: 'table-cell' }}
                  >
                    Contacto
                  </Th>
                  <Th
                    py={2.5}
                    px={4}
                    fontFamily="mono"
                    fontSize="10.5px"
                    letterSpacing="0.08em"
                    textTransform="none"
                    color={labelColor}
                    fontWeight={500}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    display={{ base: 'none', md: 'table-cell' }}
                    textAlign="center"
                  >
                    Sangre
                  </Th>
                  <Th
                    py={2.5}
                    px={4}
                    fontFamily="mono"
                    fontSize="10.5px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={labelColor}
                    fontWeight={500}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    display={{ base: 'none', md: 'table-cell' }}
                  >
                    <Box as="button" onClick={() => toggleSort('isRecurrent')}>
                      <HStack spacing={1.5}>
                        <Text as="span">Estado</Text>
                        {sortIconFor('isRecurrent')}
                      </HStack>
                    </Box>
                  </Th>
                  <Th
                    py={2.5}
                    px={4}
                    fontFamily="mono"
                    fontSize="10.5px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={labelColor}
                    fontWeight={500}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    display={{ base: 'none', lg: 'table-cell' }}
                  >
                    <Box as="button" onClick={() => toggleSort('lastVisit')}>
                      <HStack spacing={1.5}>
                        <Text as="span">Última visita</Text>
                        {sortIconFor('lastVisit')}
                      </HStack>
                    </Box>
                  </Th>
                  <Th
                    py={2.5}
                    px={2}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    w="48px"
                  />
                </Tr>
              </Thead>
              <Tbody>
                {pagedPatients.map((patient) => {
                  const age = calcAge(patient.dateOfBirth);
                  const gi = genderInitial(patient.gender);
                  const primaryContact = patient.email || patient.phone;
                  return (
                    <Tr
                      key={patient.id}
                      cursor="pointer"
                      onClick={() => {
                        if (!patient.slug?.trim()) return;
                        navigate(`/patients/${patient.slug}`);
                      }}
                      _hover={{ bg: rowHoverBg }}
                      transition="background .1s"
                      borderBottom="1px solid"
                      borderColor={borderColor}
                      _last={{ borderBottom: 'none' }}
                    >
                      <Td py={2.5} px={4} borderBottom="none">
                        <HStack spacing={3} minW={0}>
                          <Avatar
                            size="sm"
                            name={`${patient.firstName} ${patient.lastName}`}
                            src={patient.avatar}
                            bg="statusSoft.infoBg"
                            color="brand.700"
                            fontWeight={600}
                            flexShrink={0}
                          />
                          <Box minW={0}>
                            <Text
                              fontSize="13.5px"
                              fontWeight={600}
                              color={inkStrong}
                              noOfLines={1}
                            >
                              {patient.firstName} {patient.lastName}
                              {patient.lastNameMaternal
                                ? ` ${patient.lastNameMaternal}`
                                : ''}
                            </Text>
                            <Text
                              fontFamily="mono"
                              fontSize="10.5px"
                              color={labelColor}
                              letterSpacing="0.04em"
                            >
                              #{(patient.slug ?? '').toUpperCase()}
                            </Text>
                          </Box>
                        </HStack>
                      </Td>
                      <Td
                        py={2.5}
                        px={4}
                        borderBottom="none"
                        display={{ base: 'none', md: 'table-cell' }}
                      >
                        <Text fontSize="13px" color={inkStrong}>
                          {age !== null ? `${age} años` : '—'}
                        </Text>
                      </Td>
                      <Td
                        py={2.5}
                        px={4}
                        borderBottom="none"
                        display={{ base: 'none', md: 'table-cell' }}
                        textAlign="center"
                      >
                        {gi ? (
                          <Text
                            as="span"
                            fontFamily="mono"
                            fontSize="11.5px"
                            letterSpacing="0.08em"
                            fontWeight={600}
                            color={inkStrong}
                          >
                            {gi}
                          </Text>
                        ) : (
                          <Text fontSize="12.5px" color={labelColor}>
                            —
                          </Text>
                        )}
                      </Td>
                      <Td
                        py={2.5}
                        px={4}
                        borderBottom="none"
                        display={{ base: 'none', lg: 'table-cell' }}
                      >
                        {primaryContact ? (
                          <VStack align="start" spacing={0}>
                            {patient.email && (
                              <HStack spacing={1.5} color={inkStrong}>
                                <Icon
                                  as={FiMail}
                                  boxSize={3}
                                  color={labelColor}
                                />
                                <Text fontSize="12.5px" noOfLines={1}>
                                  {patient.email}
                                </Text>
                              </HStack>
                            )}
                            {patient.phone && (
                              <HStack spacing={1.5} color={subColor}>
                                <Icon
                                  as={FiPhone}
                                  boxSize={3}
                                  color={labelColor}
                                />
                                <Text
                                  fontFamily="mono"
                                  fontSize="11.5px"
                                  noOfLines={1}
                                >
                                  {patient.phone}
                                </Text>
                              </HStack>
                            )}
                          </VStack>
                        ) : (
                          <Text fontSize="12.5px" color={labelColor}>
                            —
                          </Text>
                        )}
                      </Td>
                      <Td
                        py={2.5}
                        px={4}
                        borderBottom="none"
                        display={{ base: 'none', md: 'table-cell' }}
                        textAlign="center"
                      >
                        {patient.bloodType ? (
                          <Text
                            fontFamily="mono"
                            fontSize="12px"
                            fontWeight={600}
                            color="statusSoft.critFg"
                            display="inline-block"
                            px={2}
                            py="1px"
                            borderRadius="3px"
                            bg="statusSoft.critBg"
                            border="1px solid"
                            borderColor="statusSoft.critBorder"
                            letterSpacing="0.04em"
                          >
                            {patient.bloodType}
                          </Text>
                        ) : (
                          <Text fontSize="12.5px" color={labelColor}>
                            —
                          </Text>
                        )}
                      </Td>
                      <Td
                        py={2.5}
                        px={4}
                        borderBottom="none"
                        display={{ base: 'none', md: 'table-cell' }}
                      >
                        <StatusBadge
                          tone={patient.isRecurrent ? 'signed' : 'neutral'}
                        >
                          {patient.isRecurrent ? 'Recurrente' : 'Primera vez'}
                        </StatusBadge>
                      </Td>
                      <Td
                        py={2.5}
                        px={4}
                        borderBottom="none"
                        display={{ base: 'none', lg: 'table-cell' }}
                      >
                        {patient.lastVisit ? (
                          <Text
                            fontFamily="mono"
                            fontSize="11.5px"
                            color={inkStrong}
                            letterSpacing="0.02em"
                          >
                            {format(new Date(patient.lastVisit), 'd MMM yyyy', {
                              locale: es,
                            })}
                          </Text>
                        ) : (
                          <Text fontSize="12.5px" color={labelColor}>
                            Sin visitas
                          </Text>
                        )}
                      </Td>
                      <Td
                        py={2}
                        px={2}
                        borderBottom="none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Menu isLazy>
                          <Tooltip label="Opciones" placement="left" hasArrow>
                            <MenuButton
                              as={IconButton}
                              aria-label="Opciones"
                              icon={<FiMoreVertical />}
                              variant="ghost"
                              size="sm"
                              color={labelColor}
                              _hover={{ bg: rowHoverBg, color: inkStrong }}
                            />
                          </Tooltip>
                          <MenuList>
                            <MenuItem
                              icon={<FiExternalLink />}
                              onClick={() =>
                                patient.slug?.trim() &&
                                navigate(`/patients/${patient.slug}`)
                              }
                            >
                              Abrir expediente
                            </MenuItem>
                            <MenuItem
                              icon={<FiEdit />}
                              onClick={(e) => handleEdit(e, patient)}
                            >
                              Editar paciente
                            </MenuItem>
                          </MenuList>
                        </Menu>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
          <TablePagination
            totalItems={filteredPatients.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </Box>
      )}

      <PatientAppointmentDrawer
        isOpen={isCreateOpen}
        onClose={onCreateClose}
        onSuccess={refetch}
        entry="patients"
        createAppointment={createAppointment}
      />
      <PatientFormModal
        isOpen={isEditOpen && !!editingPatientId}
        onClose={() => {
          onEditClose();
          setEditingPatientId(undefined);
        }}
        patientId={editingPatientId}
        onSuccess={refetch}
      />
    </Container>
  );
};

export default PatientList;
