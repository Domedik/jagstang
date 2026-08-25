import React, { useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Select,
  Textarea,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  Icon,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { FiChevronLeft, FiChevronRight, FiCalendar, FiX } from 'react-icons/fi';
import type { ApiAppointment } from '../../types';
import type { ApiAvailabilityConfig } from '../../services/api';
import {
  APPT_REASONS,
  DURATION_OPTIONS,
  appointmentCountByDay,
  formatDayTimelineTitle,
  isoDate,
  isSlotFree,
  isToday,
  minsToHHMM,
  fmt12,
  slotsForDay,
  weekdayForDate,
} from '../../utils/appointmentSlots';
import { FIELD_LABEL_STYLES, INPUT_STYLES, TEXTAREA_STYLES } from './styles';
import type { ApptState } from './types';

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface AppointmentColumnProps {
  appt: ApptState;
  hasWhen: boolean;
  appointments: ApiAppointment[];
  availability?: ApiAvailabilityConfig | null | undefined;
  patientName: (id: string) => string;
  onApptChange: (patch: Partial<ApptState>) => void;
  /** Whether the section can be collapsed back (appointment optional). */
  collapsible: boolean;
  onCollapse: () => void;
}

const AppointmentColumn: React.FC<AppointmentColumnProps> = ({
  appt,
  appointments,
  availability,
  patientName,
  onApptChange,
  collapsible,
  onCollapse,
}) => {
  const labelColor = useColorModeValue('paper.600', 'paper.500');
  const cardBg = useColorModeValue('white', 'paper.800');
  const timelineBorder = useColorModeValue('line.strong', 'whiteAlpha.300');

  const [collapseTipOpen, setCollapseTipOpen] = useState(false);

  const [viewMonth, setViewMonth] = useState(() =>
    appt.dateISO
      ? startOfMonth(new Date(appt.dateISO + 'T00:00:00'))
      : startOfMonth(new Date())
  );

  const countsByDay = useMemo(
    () => appointmentCountByDay(appointments),
    [appointments]
  );

  const selectedDate = appt.dateISO
    ? new Date(appt.dateISO + 'T00:00:00')
    : null;

  const todayStart = startOfDay(new Date());

  return (
    <VStack align="stretch" spacing={4} h="full" overflow="hidden">
      <HStack spacing={3} justify="space-between">
        <Text fontSize="15px" fontWeight={600} color="text.strong">
          Agendar cita
        </Text>
        {collapsible && (
          <Tooltip
            isOpen={collapseTipOpen}
            label="Cancelar programación de cita"
            placement="left"
            hasArrow
            openDelay={200}
          >
            <Box
              as="span"
              display="inline-flex"
              onMouseEnter={() => setCollapseTipOpen(true)}
              onMouseLeave={() => setCollapseTipOpen(false)}
            >
              <IconButton
                aria-label="Cancelar programación de cita"
                icon={<Icon as={FiX} boxSize={4} />}
                size="sm"
                variant="ghost"
                color="text.muted"
                _hover={{ color: 'text.strong', bg: 'surface.hover' }}
                onClick={onCollapse}
              />
            </Box>
          </Tooltip>
        )}
      </HStack>

      <FormControl>
        <FormLabel {...FIELD_LABEL_STYLES} color={labelColor}>
          Duración
        </FormLabel>
        <HStack spacing={2} flexWrap="wrap">
          {DURATION_OPTIONS.map((d) => (
            <Button
              key={d.value}
              size="sm"
              h="32px"
              variant={appt.durationMin === d.value ? 'solid' : 'outline'}
              colorScheme={appt.durationMin === d.value ? 'brand' : 'gray'}
              bg={appt.durationMin === d.value ? 'brand.600' : cardBg}
              color={appt.durationMin === d.value ? 'white' : 'text.strong'}
              borderColor="line.strong"
              onClick={() => onApptChange({ durationMin: d.value })}
            >
              {d.label}
            </Button>
          ))}
        </HStack>
      </FormControl>

      <Box flex={1} minH={0} overflowY="auto">
        <DrawerMiniCalendar
          viewMonth={viewMonth}
          selectedDate={selectedDate}
          todayStart={todayStart}
          countsByDay={countsByDay}
          availability={availability}
          onChangeMonth={setViewMonth}
          onSelectDate={(d) =>
            onApptChange({ dateISO: isoDate(d), timeMin: null })
          }
        />

        <Box
          mt={4}
          border="1px solid"
          borderColor={timelineBorder}
          borderRadius="8px"
          p={4}
          bg={cardBg}
        >
          <DayTimeline
            dateISO={appt.dateISO}
            timeMin={appt.timeMin}
            durationMin={appt.durationMin}
            appointments={appointments}
            availability={availability}
            patientName={patientName}
            onSelectTime={(min) => onApptChange({ timeMin: min })}
          />
        </Box>

        <FormControl mt={4}>
          <FormLabel {...FIELD_LABEL_STYLES} color={labelColor}>
            Motivo de la consulta
          </FormLabel>
          <Select
            {...INPUT_STYLES}
            value={appt.reason}
            onChange={(e) => onApptChange({ reason: e.target.value })}
          >
            {APPT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl mt={4}>
          <FormLabel {...FIELD_LABEL_STYLES} color={labelColor}>
            Notas adicionales
          </FormLabel>
          <Textarea
            {...TEXTAREA_STYLES}
            value={appt.additionalNotes}
            onChange={(e) => onApptChange({ additionalNotes: e.target.value })}
            placeholder="Contexto o indicaciones para la cita…"
            rows={3}
            resize="vertical"
          />
        </FormControl>
      </Box>
    </VStack>
  );
};

function DrawerMiniCalendar({
  viewMonth,
  selectedDate,
  todayStart,
  countsByDay,
  availability,
  onChangeMonth,
  onSelectDate,
}: {
  viewMonth: Date;
  selectedDate: Date | null;
  todayStart: Date;
  countsByDay: Map<string, number>;
  availability?: ApiAvailabilityConfig | null | undefined;
  onChangeMonth: (d: Date) => void;
  onSelectDate: (d: Date) => void;
}) {
  const dowColor = useColorModeValue('paper.600', 'paper.500');
  const offColor = useColorModeValue('paper.500', 'paper.600');
  const hoverBg = useColorModeValue('paper.200', 'whiteAlpha.100');
  const todayBg = useColorModeValue('brand.600', 'brand.400');
  const onBg = useColorModeValue('paper.200', 'whiteAlpha.200');

  const days = useMemo(() => {
    const startGrid = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const endGrid = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: startGrid, end: endGrid });
  }, [viewMonth]);

  return (
    <Box>
      <HStack justify="space-between" mb={2}>
        <Text fontSize="13px" fontWeight={600} textTransform="capitalize">
          {format(viewMonth, 'MMMM yyyy', { locale: es })}
        </Text>
        <HStack spacing={0}>
          <IconButton
            aria-label="Mes anterior"
            icon={<FiChevronLeft />}
            size="xs"
            variant="ghost"
            onClick={() => onChangeMonth(addMonths(viewMonth, -1))}
          />
          <IconButton
            aria-label="Mes siguiente"
            icon={<FiChevronRight />}
            size="xs"
            variant="ghost"
            onClick={() => onChangeMonth(addMonths(viewMonth, 1))}
          />
        </HStack>
      </HStack>
      <Grid templateColumns="repeat(7, 1fr)" gap="2px">
        {DOW.map((d) => (
          <Box
            key={d}
            textAlign="center"
            color={dowColor}
            fontFamily="mono"
            fontSize="10px"
            py={1}
          >
            {d}
          </Box>
        ))}
        {days.map((d) => {
          const inMonth = isSameMonth(d, viewMonth);
          const isSelected = selectedDate && isSameDay(d, selectedDate);
          const isTodayCell = isToday(d);
          const past = d < todayStart;
          const closed = availability
            ? !availability.windows.some(
                (window) =>
                  window.weekday === weekdayForDate(d, availability.timezone)
              )
            : availability === undefined
              ? false
              : true;
          const horizonEnd = availability
            ? new Date(
                todayStart.getFullYear(),
                todayStart.getMonth(),
                todayStart.getDate() + availability.horizon_days + 1
              )
            : null;
          const outsideHorizon = horizonEnd ? d >= horizonEnd : false;
          const muted = past || closed || outsideHorizon;
          const key = isoDate(d);
          const booked = countsByDay.get(key) ?? 0;
          return (
            <Box
              key={d.toISOString()}
              as="button"
              type="button"
              disabled={muted}
              opacity={muted ? 0.4 : 1}
              position="relative"
              textAlign="center"
              fontSize="12px"
              fontWeight={isSelected || isTodayCell ? 600 : 400}
              color={
                isTodayCell
                  ? 'white'
                  : isSelected
                    ? 'text.strong'
                    : inMonth
                      ? 'text.strong'
                      : offColor
              }
              bg={isTodayCell ? todayBg : isSelected ? onBg : 'transparent'}
              _hover={
                muted ? undefined : { bg: isTodayCell ? todayBg : hoverBg }
              }
              borderRadius="4px"
              py="6px"
              onClick={() => !muted && onSelectDate(d)}
            >
              {format(d, 'd')}
              {booked > 0 && !isTodayCell && (
                <HStack
                  position="absolute"
                  bottom="2px"
                  left="50%"
                  transform="translateX(-50%)"
                  spacing="2px"
                  justify="center"
                >
                  {Array.from({ length: Math.min(booked, 3) }).map((_, i) => (
                    <Box
                      key={i}
                      w="3px"
                      h="3px"
                      borderRadius="full"
                      bg="brand.600"
                    />
                  ))}
                </HStack>
              )}
            </Box>
          );
        })}
      </Grid>
    </Box>
  );
}

function DayTimeline({
  dateISO,
  timeMin,
  durationMin,
  appointments,
  availability,
  patientName,
  onSelectTime,
}: {
  dateISO: string | null;
  timeMin: number | null;
  durationMin: number;
  appointments: ApiAppointment[];
  availability?: ApiAvailabilityConfig | null | undefined;
  patientName: (id: string) => string;
  onSelectTime: (min: number) => void;
}) {
  const faint = useColorModeValue('paper.600', 'paper.500');
  const busyBg = useColorModeValue('paper.200', 'whiteAlpha.100');

  if (!dateISO) {
    return (
      <VStack py={8} color={faint} spacing={2}>
        <Icon as={FiCalendar} boxSize={7} color="paper.400" />
        <Text fontSize="13px">Elige un día en el calendario</Text>
      </VStack>
    );
  }

  const date = new Date(dateISO + 'T00:00:00');
  if (availability === undefined) {
    return (
      <Text fontSize="13px" color="text.muted">
        Cargando horarios disponibles…
      </Text>
    );
  }
  const slots = slotsForDay(date, appointments, patientName, availability);

  type Row =
    | { type: 'busy'; from: number; to: number; who: string }
    | { type: 'free'; min: number; idx: number };

  const rows: Row[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.busy) {
      let j = i;
      while (
        j + 1 < slots.length &&
        slots[j + 1].busy &&
        slots[j + 1].who === s.who
      ) {
        j++;
      }
      rows.push({
        type: 'busy',
        from: s.min,
        to: slots[j].min + slots[j].step,
        who: s.who ?? 'Ocupado',
      });
      i = j;
    } else {
      rows.push({ type: 'free', min: s.min, idx: i });
    }
  }

  return (
    <Box>
      <Text fontSize="13px" fontWeight={600} mb={3} color="text.strong">
        {formatDayTimelineTitle(date)}
      </Text>
      {slots.length === 0 ? (
        <Text fontSize="13px" color="text.muted">
          No hay disponibilidad configurada para este día.
        </Text>
      ) : (
        <VStack align="stretch" spacing={0} maxH="240px" overflowY="auto">
          {rows.map((r, i) => (
            <HStack key={i} align="flex-start" spacing={3} py={1}>
              <Text
                fontFamily="mono"
                fontSize="11px"
                color="text.muted"
                w="44px"
                flexShrink={0}
                pt={1}
              >
                {minsToHHMM(r.type === 'busy' ? r.from : r.min)}
              </Text>
              <Box flex={1}>
                {r.type === 'busy' ? (
                  <HStack
                    px={3}
                    py={2}
                    borderRadius="6px"
                    bg={busyBg}
                    fontSize="12px"
                    color="text.muted"
                    spacing={2}
                  >
                    <Icon as={FiCalendar} boxSize={3.5} />
                    <Text>{r.who}</Text>
                  </HStack>
                ) : (
                  <Button
                    w="full"
                    size="sm"
                    h="auto"
                    py={2}
                    variant={timeMin === r.min ? 'solid' : 'outline'}
                    colorScheme={timeMin === r.min ? 'brand' : 'gray'}
                    bg={timeMin === r.min ? 'brand.600' : 'transparent'}
                    color={timeMin === r.min ? 'white' : 'text.strong'}
                    borderColor="line.strong"
                    isDisabled={!isSlotFree(slots, r.idx, durationMin)}
                    fontSize="12px"
                    fontWeight={400}
                    onClick={() => onSelectTime(r.min)}
                  >
                    {timeMin === r.min
                      ? `Cita aquí · ${fmt12(r.min)}`
                      : isSlotFree(slots, r.idx, durationMin)
                        ? 'Disponible'
                        : `No cabe ${durationMin} min`}
                  </Button>
                )}
              </Box>
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  );
}

export default AppointmentColumn;
