import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  SimpleGrid,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { FiPlus, FiTrash2, FiEdit2 } from 'react-icons/fi';
import FormDrawer from './FormDrawer';
import {
  apiService,
  type ApiAvailabilityBlock,
  type ApiAvailabilityConfig,
  type ApiAvailabilityReplacePayload,
  type ApiLocation,
} from '../services/api';

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message.trim() ? err.message : fallback;

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

const DEFAULT_SETTINGS = {
  timezone: 'America/Mexico_City',
  slot_duration_minutes: 30,
  min_notice_hours: 24,
  horizon_days: 14,
};

type WindowDraft = {
  key: string;
  location_id: string;
  start_time: string;
  end_time: string;
};

type BlockDraft = {
  key: string;
  starts_at: string;
  ends_at: string;
  reason: string;
};

interface AvailabilityEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

const toLocalDatetime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalDatetime = (value: string): string => {
  if (!value) return '';
  return new Date(value).toISOString();
};

const normalizeClock = (value: string): string => {
  const trimmed = value.trim();
  // Browsers may emit HH:mm:ss from <input type="time">; API expects HH:mm.
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

const AvailabilityEditor: React.FC<AvailabilityEditorProps> = ({
  isOpen,
  onClose,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [enabledDays, setEnabledDays] = useState<Record<number, boolean>>({});
  const [windowsByDay, setWindowsByDay] = useState<
    Record<number, WindowDraft[]>
  >({});
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);

  const resetFromConfig = useCallback((cfg: ApiAvailabilityConfig) => {
    setSettings({
      timezone: cfg.timezone || DEFAULT_SETTINGS.timezone,
      slot_duration_minutes:
        cfg.slot_duration_minutes || DEFAULT_SETTINGS.slot_duration_minutes,
      min_notice_hours:
        cfg.min_notice_hours ?? DEFAULT_SETTINGS.min_notice_hours,
      horizon_days: cfg.horizon_days || DEFAULT_SETTINGS.horizon_days,
    });

    const nextEnabled: Record<number, boolean> = {};
    const nextWindows: Record<number, WindowDraft[]> = {};
    for (const window of cfg.windows ?? []) {
      nextEnabled[window.weekday] = true;
      if (!nextWindows[window.weekday]) nextWindows[window.weekday] = [];
      nextWindows[window.weekday].push({
        key: `${window.weekday}-${nextWindows[window.weekday].length}`,
        location_id: window.location_id ?? '',
        start_time: window.start_time,
        end_time: window.end_time,
      });
    }
    setEnabledDays(nextEnabled);
    setWindowsByDay(nextWindows);
    setBlocks(
      (cfg.blocks ?? []).map((block: ApiAvailabilityBlock, index) => ({
        key: block.id ?? `block-${index}`,
        starts_at: toLocalDatetime(block.starts_at),
        ends_at: toLocalDatetime(block.ends_at),
        reason: block.reason ?? '',
      }))
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [locResp, cfg] = await Promise.all([
          apiService.listLocations({ size: 100 }),
          apiService.getAvailability(),
        ]);
        if (cancelled) return;
        setLocations((locResp.results ?? []).filter((l) => l.is_active));
        resetFromConfig(cfg);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'No pudimos cargar la disponibilidad',
            description: errorText(err, 'Intenta de nuevo.'),
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, resetFromConfig, toast]);

  const toggleDay = (weekday: number, enabled: boolean) => {
    setEnabledDays((prev) => ({ ...prev, [weekday]: enabled }));
    if (enabled && !(windowsByDay[weekday]?.length > 0)) {
      setWindowsByDay((prev) => ({
        ...prev,
        [weekday]: [
          {
            key: `${weekday}-0`,
            location_id: '',
            start_time: '09:00',
            end_time: '17:00',
          },
        ],
      }));
    }
  };

  const addWindow = (weekday: number) => {
    setWindowsByDay((prev) => {
      const current = prev[weekday] ?? [];
      return {
        ...prev,
        [weekday]: [
          ...current,
          {
            key: `${weekday}-${current.length}`,
            location_id: '',
            start_time: '09:00',
            end_time: '17:00',
          },
        ],
      };
    });
  };

  const updateWindow = (
    weekday: number,
    index: number,
    patch: Partial<WindowDraft>
  ) => {
    setWindowsByDay((prev) => {
      const current = [...(prev[weekday] ?? [])];
      current[index] = { ...current[index], ...patch };
      return { ...prev, [weekday]: current };
    });
  };

  const removeWindow = (weekday: number, index: number) => {
    setWindowsByDay((prev) => {
      const current = [...(prev[weekday] ?? [])];
      current.splice(index, 1);
      return { ...prev, [weekday]: current };
    });
  };

  const payload = useMemo((): ApiAvailabilityReplacePayload => {
    const windows: ApiAvailabilityReplacePayload['windows'] = [];
    for (const day of WEEKDAYS) {
      if (!enabledDays[day.value]) continue;
      for (const window of windowsByDay[day.value] ?? []) {
        windows.push({
          weekday: day.value,
          start_time: normalizeClock(window.start_time),
          end_time: normalizeClock(window.end_time),
          location_id: window.location_id || null,
        });
      }
    }
    return {
      settings,
      windows,
      blocks: blocks
        .filter((b) => b.starts_at && b.ends_at)
        .map((b) => ({
          starts_at: fromLocalDatetime(b.starts_at),
          ends_at: fromLocalDatetime(b.ends_at),
          reason: b.reason.trim() || null,
        })),
    };
  }, [blocks, enabledDays, settings, windowsByDay]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const cfg = await apiService.putAvailability(payload);
      resetFromConfig(cfg);
      toast({
        title: 'Disponibilidad guardada',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onClose();
    } catch (err) {
      toast({
        title: 'No pudimos guardar la disponibilidad',
        description: errorText(err, 'Revisa los horarios e intenta de nuevo.'),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      crumb="Agenda"
      title="Disponibilidad semanal"
      sub="Horarios recurrentes y bloqueos excepcionales para solicitudes públicas."
      size="lg"
      onSubmit={handleSubmit}
      isSubmitting={saving || loading}
      submitLabel="Guardar disponibilidad"
      submitLoadingText="Guardando…"
      isSubmitDisabled={loading}
    >
      <VStack align="stretch" spacing={6} pb={4}>
        <Box>
          <Text fontSize="13px" fontWeight={600} color="text.strong" mb={3}>
            Configuración de slots
          </Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel fontSize="13px">Zona horaria</FormLabel>
              <Input
                value={settings.timezone}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, timezone: e.target.value }))
                }
                placeholder="America/Mexico_City"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Duración de slot (minutos)</FormLabel>
              <NumberInput
                min={5}
                max={240}
                value={settings.slot_duration_minutes}
                onChange={(_, n) =>
                  setSettings((s) => ({
                    ...s,
                    slot_duration_minutes: Number.isFinite(n)
                      ? n
                      : s.slot_duration_minutes,
                  }))
                }
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Anticipación mínima (horas)</FormLabel>
              <NumberInput
                min={0}
                value={settings.min_notice_hours}
                onChange={(_, n) =>
                  setSettings((s) => ({
                    ...s,
                    min_notice_hours: Number.isFinite(n)
                      ? n
                      : s.min_notice_hours,
                  }))
                }
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Horizonte público (días)</FormLabel>
              <NumberInput
                min={1}
                max={30}
                value={settings.horizon_days}
                onChange={(_, n) =>
                  setSettings((s) => ({
                    ...s,
                    horizon_days: Number.isFinite(n) ? n : s.horizon_days,
                  }))
                }
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
          </SimpleGrid>
        </Box>

        <Divider borderColor="line.strong" />

        <Box>
          <HStack justify="space-between" mb={3}>
            <Text fontSize="13px" fontWeight={600} color="text.strong">
              Consultorios
            </Text>
            <Button
              leftIcon={<FiPlus />}
              size="xs"
              variant="outline"
              onClick={async () => {
                const name = window.prompt('Nombre del consultorio');
                if (!name?.trim()) return;
                try {
                  const loc = await apiService.createLocation({
                    name: name.trim(),
                  });
                  setLocations((prev) => [...prev, loc]);
                  toast({
                    title: 'Consultorio creado',
                    status: 'success',
                    duration: 2500,
                  });
                } catch (err) {
                  toast({
                    title: 'No se pudo crear el consultorio',
                    description: errorText(err, 'Intenta de nuevo.'),
                    status: 'error',
                    duration: 4000,
                  });
                }
              }}
            >
              Agregar
            </Button>
          </HStack>
          {locations.length === 0 ? (
            <Text fontSize="13px" color="text.label">
              Sin consultorios. Agrégalos para asociarlos a ventanas de horario.
            </Text>
          ) : (
            <VStack align="stretch" spacing={2}>
              {locations.map((loc) => (
                <HStack
                  key={loc.id}
                  justify="space-between"
                  border="1px solid"
                  borderColor="line.strong"
                  borderRadius="8px"
                  px={3}
                  py={2}
                >
                  <Box>
                    <Text fontSize="14px" fontWeight={500}>
                      {loc.name}
                    </Text>
                    {loc.address ? (
                      <Text fontSize="12px" color="text.label">
                        {loc.address}
                      </Text>
                    ) : null}
                  </Box>
                  <HStack>
                    <IconButton
                      aria-label="Renombrar consultorio"
                      icon={<FiEdit2 />}
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const name = window.prompt('Nuevo nombre', loc.name);
                        if (!name?.trim() || name.trim() === loc.name) return;
                        try {
                          const updated = await apiService.updateLocation(
                            loc.id,
                            { name: name.trim() }
                          );
                          setLocations((prev) =>
                            prev.map((l) => (l.id === loc.id ? updated : l))
                          );
                        } catch (err) {
                          toast({
                            title: 'No se pudo actualizar',
                            description: errorText(err, 'Intenta de nuevo.'),
                            status: 'error',
                            duration: 4000,
                          });
                        }
                      }}
                    />
                    <IconButton
                      aria-label="Eliminar consultorio"
                      icon={<FiTrash2 />}
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `¿Eliminar «${loc.name}»? Las ventanas que lo usen quedarán sin consultorio.`
                          )
                        ) {
                          return;
                        }
                        try {
                          await apiService.deleteLocation(loc.id);
                          setLocations((prev) =>
                            prev.filter((l) => l.id !== loc.id)
                          );
                        } catch (err) {
                          toast({
                            title: 'No se pudo eliminar',
                            description: errorText(err, 'Intenta de nuevo.'),
                            status: 'error',
                            duration: 4000,
                          });
                        }
                      }}
                    />
                  </HStack>
                </HStack>
              ))}
            </VStack>
          )}
        </Box>

        <Divider borderColor="line.strong" />

        <Box>
          <Text fontSize="13px" fontWeight={600} color="text.strong" mb={3}>
            Horario semanal
          </Text>
          <VStack align="stretch" spacing={4}>
            {WEEKDAYS.map((day) => {
              const enabled = !!enabledDays[day.value];
              const dayWindows = windowsByDay[day.value] ?? [];
              return (
                <Box
                  key={day.value}
                  border="1px solid"
                  borderColor="line.strong"
                  borderRadius="8px"
                  p={4}
                >
                  <Checkbox
                    isChecked={enabled}
                    onChange={(e) => toggleDay(day.value, e.target.checked)}
                    colorScheme="brand"
                    mb={enabled ? 3 : 0}
                  >
                    <Text fontSize="14px" fontWeight={500}>
                      {day.label}
                    </Text>
                  </Checkbox>
                  {enabled && (
                    <VStack align="stretch" spacing={3}>
                      {dayWindows.map((window, index) => (
                        <SimpleGrid
                          key={window.key}
                          columns={{ base: 1, md: 4 }}
                          spacing={3}
                          alignItems="end"
                        >
                          <FormControl>
                            <FormLabel fontSize="12px">Inicio</FormLabel>
                            <Input
                              type="time"
                              value={window.start_time}
                              onChange={(e) =>
                                updateWindow(day.value, index, {
                                  start_time: e.target.value,
                                })
                              }
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="12px">Fin</FormLabel>
                            <Input
                              type="time"
                              value={window.end_time}
                              onChange={(e) =>
                                updateWindow(day.value, index, {
                                  end_time: e.target.value,
                                })
                              }
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="12px">Consultorio</FormLabel>
                            <Select
                              value={window.location_id}
                              onChange={(e) =>
                                updateWindow(day.value, index, {
                                  location_id: e.target.value,
                                })
                              }
                              placeholder="Sin consultorio"
                            >
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name}
                                </option>
                              ))}
                            </Select>
                          </FormControl>
                          <HStack justify="flex-end">
                            <IconButton
                              aria-label="Eliminar ventana"
                              icon={<FiTrash2 />}
                              size="sm"
                              variant="ghost"
                              onClick={() => removeWindow(day.value, index)}
                              isDisabled={dayWindows.length <= 1}
                            />
                          </HStack>
                        </SimpleGrid>
                      ))}
                      <Button
                        leftIcon={<FiPlus />}
                        size="sm"
                        variant="outline"
                        alignSelf="flex-start"
                        onClick={() => addWindow(day.value)}
                      >
                        Agregar ventana
                      </Button>
                    </VStack>
                  )}
                </Box>
              );
            })}
          </VStack>
        </Box>

        <Divider borderColor="line.strong" />

        <Box>
          <HStack justify="space-between" mb={3}>
            <Text fontSize="13px" fontWeight={600} color="text.strong">
              Bloqueos excepcionales
            </Text>
            <Button
              leftIcon={<FiPlus />}
              size="sm"
              variant="outline"
              onClick={() =>
                setBlocks((prev) => [
                  ...prev,
                  {
                    key: `block-${prev.length}`,
                    starts_at: '',
                    ends_at: '',
                    reason: '',
                  },
                ])
              }
            >
              Agregar bloqueo
            </Button>
          </HStack>
          {blocks.length === 0 ? (
            <Text fontSize="13px" color="text.muted">
              Vacaciones o bloqueos parciales por fecha y hora.
            </Text>
          ) : (
            <VStack align="stretch" spacing={3}>
              {blocks.map((block, index) => (
                <SimpleGrid
                  key={block.key}
                  columns={{ base: 1, md: 4 }}
                  spacing={3}
                  alignItems="end"
                >
                  <FormControl>
                    <FormLabel fontSize="12px">Desde</FormLabel>
                    <Input
                      type="datetime-local"
                      value={block.starts_at}
                      onChange={(e) =>
                        setBlocks((prev) => {
                          const next = [...prev];
                          next[index] = {
                            ...next[index],
                            starts_at: e.target.value,
                          };
                          return next;
                        })
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="12px">Hasta</FormLabel>
                    <Input
                      type="datetime-local"
                      value={block.ends_at}
                      onChange={(e) =>
                        setBlocks((prev) => {
                          const next = [...prev];
                          next[index] = {
                            ...next[index],
                            ends_at: e.target.value,
                          };
                          return next;
                        })
                      }
                    />
                  </FormControl>
                  <FormControl gridColumn={{ md: 'span 1' }}>
                    <FormLabel fontSize="12px">Motivo</FormLabel>
                    <Input
                      value={block.reason}
                      onChange={(e) =>
                        setBlocks((prev) => {
                          const next = [...prev];
                          next[index] = {
                            ...next[index],
                            reason: e.target.value,
                          };
                          return next;
                        })
                      }
                      placeholder="Vacaciones"
                    />
                  </FormControl>
                  <HStack justify="flex-end">
                    <IconButton
                      aria-label="Eliminar bloqueo"
                      icon={<FiTrash2 />}
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setBlocks((prev) => prev.filter((_, i) => i !== index))
                      }
                    />
                  </HStack>
                </SimpleGrid>
              ))}
            </VStack>
          )}
        </Box>
      </VStack>
    </FormDrawer>
  );
};

export default AvailabilityEditor;
