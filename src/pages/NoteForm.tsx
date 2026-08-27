import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  Box,
  Container,
  HStack,
  VStack,
  Text,
  Button,
  Input,
  Select,
  useToast,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useColorModeValue,
  Spinner,
  Collapse,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Icon,
  Avatar,
  Link as ChakraLink,
} from '@chakra-ui/react';
import {
  FiX,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiEdit3,
  FiList,
  FiType,
} from 'react-icons/fi';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { mockNoteTemplates, mockWellnessNoteTemplates } from '../data/mockData';
import RichTextEditor from '../components/RichTextEditor';
import FormNoteFiller from '../components/FormNoteFiller';
import type { FormFieldValue } from '../components/FormNoteFiller';
import type { NoteType, NoteCompletenessAnalysis } from '../types';
import { usePatient, usePatients } from '../hooks/usePatients';
import { usePatientVitals } from '../hooks/usePatientVitals';
import {
  usePatientSignosVitales,
  isSignosEmpty,
} from '../hooks/usePatientSignosVitales';
import { useNotes } from '../hooks/useNotes';
import { useClientEvents, type ClientEvent } from '../hooks/useClientEvents';
import PatientClinicalSummary from '../components/PatientClinicalSummary';
import CollapsibleSideCard from '../components/CollapsibleSideCard';
import { apiService } from '../services/api';
import { normalizePatientSlug } from '../utils/patientSlug';
import { getErrorMessage } from '../utils/apiStatus';
import { STRUCTURED_NOTE_EDITOR_ENABLED } from '../config/features';
import { useAuth } from '../contexts/AuthContext';
import PageHead from '../components/PageHead';
import {
  mergeNoteBodyForEditor,
  serializeNoteBodyForApi,
} from '../utils/noteReceta';
import StructuredNoteEditor, {
  StructuredNomMeter,
} from '../components/StructuredNoteEditor';
import {
  getSchema,
  getRequiredProgress,
  parseStructuredContent,
  type NoteSchema,
  type StructuredFormValues,
  type StructuredVitals,
} from '../data/noteSchemas';
import { parseTemplateContent } from '../data/customNoteSchemas';

/**
 * Deep-equality for StructuredFormValues. Values are plain strings, string
 * arrays, or a `vitals` object of strings — a recursive compare over the keys
 * of the `vitals` sub-object is enough; other entries are scalars or arrays.
 */
function structuredValuesEqual(
  a: StructuredFormValues,
  b: StructuredFormValues
): boolean {
  const keysA = Object.keys(a).filter((k) => k !== 'vitals');
  const keysB = Object.keys(b).filter((k) => k !== 'vitals');
  if (keysA.length !== keysB.length) return false;
  if (keysA.some((k) => !keysB.includes(k))) return false;
  for (const k of keysA) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) || Array.isArray(bv)) {
      const arrA = Array.isArray(av) ? av : [];
      const arrB = Array.isArray(bv) ? bv : [];
      if (arrA.length !== arrB.length || arrA.some((v, i) => v !== arrB[i]))
        return false;
    } else if (av !== bv) {
      return false;
    }
  }
  const vitalsA = a.vitals ?? {};
  const vitalsB = b.vitals ?? {};
  const vKeys = [
    'bp_sys',
    'bp_dia',
    'hr',
    'rr',
    'temp',
    'spo2',
    'glucose',
    'weight',
    'height',
    'abdominal_perimeter',
  ];
  for (const k of vKeys) {
    const va = (vitalsA[k as keyof typeof vitalsA] ?? '').trim();
    const vb = (vitalsB[k as keyof typeof vitalsB] ?? '').trim();
    if (va !== vb) return false;
  }
  return true;
}

/** Best-effort extraction of a note id from an SSE event payload. */
function extractNoteId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const candidate = o.note_id ?? o.noteId ?? o.id ?? o.resource_id;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

/**
 * v2.0 SSE messages arrive as `{ event, status, result }` (the backend `Message`
 * struct). When a background completeness analysis finishes, the analysis JSON is
 * delivered inline in `result` with `status: 200` — read it directly instead of
 * re-fetching the note, whose embedded `analysis` may still be null at that point.
 */
function extractAnalysisFromEvent(
  data: unknown
): NoteCompletenessAnalysis | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  // Only successful messages carry a ready analysis.
  if (typeof msg.status === 'number' && msg.status !== 200) return null;
  // The analysis lives in `result`; tolerate payloads that inline it at the top.
  const candidate =
    msg.result && typeof msg.result === 'object'
      ? (msg.result as Record<string, unknown>)
      : msg;
  if (typeof candidate.completeness_score !== 'number') return null;
  return {
    completeness_score: candidate.completeness_score,
    missing_fields: Array.isArray(candidate.missing_fields)
      ? (candidate.missing_fields as string[])
      : [],
    reasoning:
      candidate.reasoning && typeof candidate.reasoning === 'object'
        ? (candidate.reasoning as Record<string, string>)
        : {},
  };
}

const NoteForm: React.FC = () => {
  const { patientSlug, noteId } = useParams<{
    patientSlug: string;
    noteId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { doctor } = useAuth();

  const cardBg = useColorModeValue('white', 'paper.800');
  const paperBg = useColorModeValue('paper.100', 'whiteAlpha.50');
  const borderColor = useColorModeValue('line.light', 'whiteAlpha.200');
  const softBorder = useColorModeValue('line.strong', 'whiteAlpha.300');
  const labelColor = useColorModeValue('paper.600', 'paper.500');
  const subColor = useColorModeValue('paper.700', 'paper.400');
  const inkStrong = useColorModeValue('paper.900', 'paper.50');
  const bodyColor = useColorModeValue('paper.700', 'paper.400');

  const { patients } = usePatients();
  const patientId = useMemo(() => {
    const raw = (patientSlug ?? '').trim().replace(/^#/, '');
    if (!raw) return undefined;
    const match = patients.find((p) => p.slug === raw || p.id === raw);
    if (match?.id) return match.id;
    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        raw
      );
    return looksLikeUuid ? raw : undefined;
  }, [patients, patientSlug]);

  const { patient, loading: patientLoading } = usePatient(patientId);
  const patientPathBase = useMemo(() => {
    const slug =
      normalizePatientSlug(patient?.slug) ||
      normalizePatientSlug(patientSlug) ||
      patientId;
    return slug ? `/patients/${slug}` : '/patients';
  }, [patient?.slug, patientSlug, patientId]);

  // Replace /patients/{id}/... with /patients/{slug}/... once slug is available.
  useEffect(() => {
    const slug = patient?.slug?.trim();
    const raw = (patientSlug ?? '').trim().replace(/^#/, '');
    if (!slug || !raw || raw === slug) return;
    if (location.pathname.startsWith(`/patients/${raw}`)) {
      navigate(
        location.pathname.replace(`/patients/${raw}`, `/patients/${slug}`),
        {
          replace: true,
          state: location.state,
        }
      );
    }
  }, [location.pathname, location.state, navigate, patient?.slug, patientSlug]);
  const { vitals, loading: vitalsLoading } = usePatientVitals(patientId);
  // Última toma de signos vitales de la vista unificada del paciente
  // (`patient.vital`), fuente del botón «Copiar últimos» del editor estructurado.
  const { signos: latestSignos } = usePatientSignosVitales(patientId);
  const {
    createNote,
    updateNote,
    updateNoteDate,
    signNote,
    getNoteAnalysis,
    notes,
    loading: notesLoading,
  } = useNotes(patientId);

  const [title, setTitle] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('evolution');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [completenessAnalysis, setCompletenessAnalysis] =
    useState<NoteCompletenessAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isNomOpen, setIsNomOpen] = useState(false);

  const [useFormMode, setUseFormMode] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [doctorForms, setDoctorForms] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formFieldValues, setFormFieldValues] = useState<FormFieldValue[]>([]);

  // Custom note-type templates (Constructor de formularios) — parallel to the
  // useFormMode/selectedFormId pair above, but for schemas that plug into the
  // structured editor instead of the PDF form filler.
  const [customTemplates, setCustomTemplates] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [customSchema, setCustomSchema] = useState<NoteSchema | null>(null);
  const [customSchemaLoading, setCustomSchemaLoading] = useState(false);

  // Structured form (Proposal A) state. New notes open in the structured form by
  // default; loading an existing note overrides this based on its content, and note
  // types without a schema fall back to the text editor automatically.
  const [noteEditorMode, setNoteEditorMode] = useState<'structured' | 'text'>(
    STRUCTURED_NOTE_EDITOR_ENABLED ? 'structured' : 'text'
  );
  const [structuredValues, setStructuredValues] =
    useState<StructuredFormValues>({});
  const [savedStructuredValues, setSavedStructuredValues] =
    useState<StructuredFormValues>({});

  const [savedTitle, setSavedTitle] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [savedType, setSavedType] = useState<NoteType>('evolution');
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(
    noteId || null
  );
  const [noteStatus, setNoteStatus] = useState<'new' | 'draft' | 'signed'>(
    'new'
  );
  const [noteCreatedAt, setNoteCreatedAt] = useState<string | null>(null);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editingDateValue, setEditingDateValue] = useState('');
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);

  const handleStartEditDate = () => {
    if (!noteCreatedAt) return;
    const d = new Date(noteCreatedAt);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditingDateValue(local);
    setIsEditingDate(true);
  };

  const handleConfirmDateChange = async () => {
    if (!currentNoteId || !patientId || !editingDateValue) return;
    setIsUpdatingDate(true);
    try {
      const isoDate = new Date(editingDateValue).toISOString();
      await updateNoteDate(currentNoteId, isoDate);
      setNoteCreatedAt(isoDate);
      toast({
        title: 'Fecha actualizada',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setIsEditingDate(false);
    } catch (err: unknown) {
      toast({
        title: 'Error al actualizar fecha',
        description: getErrorMessage(err, 'No se pudo actualizar la fecha'),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsUpdatingDate(false);
    }
  };

  const {
    isOpen: isConfirmSignOpen,
    onOpen: onConfirmSignOpen,
    onClose: onConfirmSignClose,
  } = useDisclosure();

  const isLoadingAnalysisAfterSaveRef = useRef(false);
  const followUpLoadedRef = useRef(false);
  const followUpOfRef = useRef<string | null>(null);

  const role = (doctor?.role ?? '').toUpperCase();
  const isWellness = role === 'WELLNESS';
  const templatesForRole = isWellness
    ? mockWellnessNoteTemplates
    : mockNoteTemplates;

  const hasChanges = () => {
    if (useFormMode) return title !== savedTitle || content !== savedContent;
    if (noteEditorMode === 'structured')
      return (
        title !== savedTitle ||
        noteType !== savedType ||
        !structuredValuesEqual(structuredValues, savedStructuredValues)
      );
    return (
      title !== savedTitle || content !== savedContent || noteType !== savedType
    );
  };

  // Load existing note when editing
  useEffect(() => {
    if (!noteId || !patientId) {
      setIsLoadingNote(false);
      return;
    }
    if (notesLoading) return;

    setIsLoadingNote(true);
    const note = notes.find((n) => n.id === noteId);

    if (note) {
      const rawContent = note.content || '';
      let isFormNote = false;
      try {
        const parsed = JSON.parse(rawContent);
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          parsed.formId &&
          Array.isArray(parsed.fields)
        ) {
          isFormNote = true;
        } else if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed[0].name &&
          parsed[0].type
        ) {
          isFormNote = true;
        }
      } catch {
        /* not JSON */
      }

      if (isFormNote) {
        // Las notas por formulario tienen su propio editor dedicado.
        // Redirigimos para que el usuario vea siempre la misma UI al editarlas.
        navigate(`${patientPathBase}/notes/${note.id}/edit-form`, {
          replace: true,
        });
        return;
      }

      // Detect structured form content
      const structuredData = parseStructuredContent(rawContent);
      if (structuredData) {
        setNoteEditorMode('structured');
        const loadedValues = structuredData.values ?? {};
        setStructuredValues(loadedValues);
        setSavedStructuredValues(loadedValues);
        setContent('');
        if (structuredData.templateId) {
          setSelectedTemplateId(structuredData.templateId);
        }
      } else {
        setNoteEditorMode('text');
        setContent(mergeNoteBodyForEditor(rawContent));
      }

      setTitle(note.title);
      setNoteType(note.type);
      setSavedTitle(note.title);
      setSavedContent(mergeNoteBodyForEditor(structuredData ? '' : rawContent));
      setSavedType(note.type);
      setCurrentNoteId(note.id);
      setNoteStatus(note.status);
      setNoteCreatedAt(note.createdAt);
      if (
        note.status === 'draft' &&
        note.id &&
        !isLoadingAnalysisAfterSaveRef.current &&
        !isFormNote
      ) {
        loadCompletenessAnalysis(note.id).catch((error) => {
          console.error('Error loading completeness analysis:', error);
        });
      }
      setIsLoadingNote(false);
    } else {
      setIsLoadingNote(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, notes, patientId, notesLoading]);

  // Follow-up from signed note
  useEffect(() => {
    const followUpNoteId = (
      location.state as { followUpFromNoteId?: string } | null
    )?.followUpFromNoteId;
    if (!patientId || !followUpNoteId || noteId) return;

    let cancelled = false;
    (async () => {
      setIsLoadingNote(true);
      try {
        const note = await apiService.getNote(patientId, followUpNoteId);
        if (cancelled) return;
        const rawContent = note.content || '';

        let isFormNote = false;
        let parsedFormValues: FormFieldValue[] = [];
        let restoredFormId: string | null = null;
        try {
          const parsed = JSON.parse(rawContent);
          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            parsed.formId &&
            Array.isArray(parsed.fields)
          ) {
            isFormNote = true;
            parsedFormValues = parsed.fields;
            restoredFormId = parsed.formId;
          }
        } catch {
          /* not JSON */
        }

        followUpLoadedRef.current = true;
        followUpOfRef.current = followUpNoteId;

        if (isFormNote) {
          // Las notas por formulario tienen su propio editor; el seguimiento
          // simplemente abre el selector de formularios para que el usuario
          // elija de nuevo (los valores de campos suelen requerir actualizarse).
          void parsedFormValues;
          void restoredFormId;
          navigate(`${patientPathBase}/notes/new-form`, {
            replace: true,
            state: { followUpFromNoteId: followUpNoteId },
          });
          return;
        }

        setTitle(`Seguimiento - ${note.title || 'Nota anterior'}`);
        setNoteStatus('new');

        const noteTypeVal = (note.type || 'evolution') as NoteType;
        setContent(mergeNoteBodyForEditor(rawContent));
        setNoteType(noteTypeVal);

        navigate(`${patientPathBase}/notes/new`, {
          replace: true,
          state: {},
        });
      } catch {
        if (!cancelled) {
          toast({
            title: 'Error',
            description: 'No se pudo cargar la nota para seguimiento',
            status: 'error',
            duration: 4000,
            isClosable: true,
          });
        }
      } finally {
        if (!cancelled) setIsLoadingNote(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // patientPathBase derived from patientSlug; intentional omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, noteId, location.state, navigate, toast]);

  // v2.0: the completeness analysis is pushed over the SSE events stream when the
  // background job finishes (see handleClientEvent). So we only do a single read
  // here — no polling loop. If the note already carries an embedded analysis
  // (e.g. reopening an older draft) show it immediately; if it's not ready yet
  // (404) leave the panel in its "Analizando…" state and let the SSE message
  // deliver the result.
  const loadCompletenessAnalysis = async (id: string): Promise<void> => {
    if (!id) return;
    setIsLoadingAnalysis(true);
    setCompletenessAnalysis(null);
    try {
      const analysis = await getNoteAnalysis(id);
      setCompletenessAnalysis(analysis);
      setIsLoadingAnalysis(false);
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: number }).status
          : 0;
      // 404 = not computed yet; keep the loading state and wait for the SSE push.
      // Any other error → give up quietly.
      if (status !== 404) {
        setIsLoadingAnalysis(false);
      }
    }
  };

  // v2.0: the completeness analysis is delivered over the SSE events stream when
  // the background job finishes — this is the primary mechanism (there is no
  // polling). Apply the analysis from the SSE message as soon as it arrives.
  const handleClientEvent = useCallback(
    (evt: ClientEvent) => {
      if (!currentNoteId || noteStatus !== 'draft' || useFormMode) return;

      // Preferred path (v2.0): the finished analysis is delivered inline in the
      // SSE message's `result` field — apply it directly, no re-fetch needed.
      const analysisFromEvent = extractAnalysisFromEvent(evt.data);
      if (analysisFromEvent) {
        setCompletenessAnalysis(analysisFromEvent);
        setIsLoadingAnalysis(false);
        return;
      }

      // Fallback: an event without an inline analysis. Don't rely on matching its
      // fields: if it names a different note, skip it; otherwise re-read the note
      // in case its embedded `analysis` just became available.
      const noteIdFromEvent = extractNoteId(evt.data);
      if (noteIdFromEvent && noteIdFromEvent !== currentNoteId) return;
      getNoteAnalysis(currentNoteId)
        .then((analysis) => {
          setCompletenessAnalysis(analysis);
          setIsLoadingAnalysis(false);
        })
        .catch(() => {
          // Not ready yet; a later SSE message will deliver the analysis.
        });
    },
    [currentNoteId, noteStatus, useFormMode, getNoteAnalysis]
  );

  useClientEvents(
    patientId,
    noteStatus === 'draft' && !!currentNoteId && !useFormMode,
    handleClientEvent
  );

  useEffect(() => {
    if (noteStatus !== 'new' || followUpLoadedRef.current || useFormMode)
      return;
    const template = templatesForRole.find((t) => t.type === noteType);
    if (!template) return;
    setTitle(template.name);
    setContent(template.content);
  }, [noteType, noteStatus, useFormMode, templatesForRole]);

  useEffect(() => {
    if (!isWellness) return;
    if (noteStatus !== 'new') return;
    if (useFormMode) return;
    if (selectedTemplateId) return;
    if (
      noteType !== 'psychology-interrogation' &&
      noteType !== 'psychology-evolution'
    ) {
      setNoteType('psychology-evolution');
    }
  }, [isWellness, noteStatus, useFormMode, noteType, selectedTemplateId]);

  useEffect(() => {
    if (location.state?.type && noteStatus === 'new') {
      setNoteType(location.state.type);
    }
  }, [location.state, noteStatus]);

  useEffect(() => {
    if (!useFormMode) return;
    let cancelled = false;
    setFormsLoading(true);
    apiService
      .listDoctorForms({ size: 100 })
      .then((res) => {
        if (!cancelled) setDoctorForms(res.results);
      })
      .catch(() => {
        if (!cancelled)
          toast({
            title: 'No se pudieron cargar los formularios',
            status: 'warning',
            duration: 3000,
          });
      })
      .finally(() => {
        if (!cancelled) setFormsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useFormMode, toast]);

  // Custom note-type templates for the "Tipo" selector — fetched unconditionally
  // (unlike doctorForms above) so they're available as soon as the selector renders.
  useEffect(() => {
    let cancelled = false;
    apiService
      .listDoctorTemplates({ size: 100 })
      .then((res) => {
        if (!cancelled) {
          setCustomTemplates(
            res.results.map((t) => ({ id: t.id, name: t.name }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: 'No se pudieron cargar tus tipos de nota personalizados',
            status: 'warning',
            duration: 3000,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Fetch+parse the selected custom template's schema whenever it changes.
  useEffect(() => {
    if (!selectedTemplateId) {
      setCustomSchema(null);
      return;
    }
    let cancelled = false;
    setCustomSchemaLoading(true);
    apiService
      .getDoctorTemplate(selectedTemplateId)
      .then((tpl) => {
        if (cancelled) return;
        const parsed = parseTemplateContent(tpl.content);
        if (parsed) {
          setCustomSchema({
            noteTypeLabel: tpl.name,
            sections: parsed.sections,
          });
        } else {
          setCustomSchema(null);
          toast({
            title: 'No se pudo leer este tipo de nota personalizado',
            status: 'warning',
            duration: 4000,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomSchema(null);
          toast({
            title: 'No se pudo cargar el tipo de nota',
            status: 'error',
            duration: 4000,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCustomSchemaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTemplateId, toast]);

  const handleNoteTypeSelectChange = (value: string) => {
    if (value === 'form') {
      setUseFormMode(true);
      setNoteType('document');
      setContent('');
      setSelectedFormId(null);
      setFormFieldValues([]);
      setSelectedTemplateId(null);
    } else if (value.startsWith('custom:')) {
      const templateId = value.slice('custom:'.length);
      setUseFormMode(false);
      setSelectedFormId(null);
      setFormFieldValues([]);
      setNoteType('custom');
      setSelectedTemplateId(templateId);
      setNoteEditorMode('structured');
      const tpl = customTemplates.find((t) => t.id === templateId);
      if (tpl) {
        setTitle(tpl.name);
      }
    } else {
      setUseFormMode(false);
      setSelectedFormId(null);
      setFormFieldValues([]);
      setSelectedTemplateId(null);
      setNoteType(value as NoteType);
    }
  };

  const handleFormSelect = (formId: string) => {
    setSelectedFormId(formId);
    const form = doctorForms.find((f) => f.id === formId);
    if (form) setTitle(form.name);
    setFormFieldValues([]);
  };

  const handleFormValuesChange = useCallback(
    (vals: FormFieldValue[]) => {
      setFormFieldValues(vals);
      setContent(JSON.stringify({ formId: selectedFormId, fields: vals }));
    },
    [selectedFormId]
  );

  // Signos vitales para el botón «Copiar últimos» del editor estructurado. Toma
  // la última medición registrada en la vista unificada del paciente
  // (`patient.vital`) y la mapea al modelo del formulario (`StructuredVitals`).
  const lastVitals = useMemo(() => {
    if (!latestSignos || isSignosEmpty(latestSignos)) return null;
    const toStr = (v: number | null) => (v === null ? undefined : String(v));
    const vit: StructuredVitals = {
      bp_sys: toStr(latestSignos.systolic),
      bp_dia: toStr(latestSignos.diastolic),
      hr: toStr(latestSignos.heartRate),
      rr: toStr(latestSignos.respRate),
      temp: toStr(latestSignos.temperature),
      spo2: toStr(latestSignos.spo2),
      glucose: toStr(latestSignos.glucose),
      weight: toStr(latestSignos.weight),
      height: toStr(latestSignos.height),
      abdominal_perimeter: toStr(latestSignos.abdominalPerimeter),
    };
    const recordedAt = latestSignos.takenAt
      ? format(new Date(latestSignos.takenAt), "d 'de' MMM, yyyy", {
          locale: es,
        })
      : 'toma más reciente';
    return { vitals: vit, recordedAt };
  }, [latestSignos]);

  const activeSchema = useMemo(
    () => (selectedTemplateId ? customSchema : getSchema(noteType)),
    [selectedTemplateId, customSchema, noteType]
  );

  if (patientLoading || isLoadingNote || (noteId && notesLoading)) {
    return (
      <Container maxW="1280px" py={10}>
        <VStack spacing={4}>
          <Spinner size="xl" color="brand.500" />
          <Text>Cargando...</Text>
        </VStack>
      </Container>
    );
  }

  if (!patient) {
    return (
      <Container maxW="1280px" py={10}>
        <VStack spacing={4}>
          <Text fontSize="lg">Paciente no encontrado</Text>
          <Button onClick={() => navigate('/patients')}>
            Volver a pacientes
          </Button>
        </VStack>
      </Container>
    );
  }

  const handleSaveDraft = async () => {
    if (!patientId) return;

    if (useFormMode) {
      if (!selectedFormId) {
        toast({
          title: 'Selecciona un formulario',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
      const anyFilled = formFieldValues.some((f) => f.value.trim() !== '');
      if (!anyFilled) {
        toast({
          title: 'Completa al menos un campo del formulario',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
    } else if (noteEditorMode === 'structured') {
      // structured mode — always valid (empty note is OK as draft), except a
      // custom template whose schema snapshot hasn't finished loading yet —
      // saving now would persist the note without its field definitions.
      if (selectedTemplateId && customSchemaLoading) {
        toast({
          title: 'Espera a que cargue el tipo de nota',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
    } else if (!content.trim()) {
      toast({
        title: 'Error',
        description: 'El contenido de la nota es requerido',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsSubmitting(true);
    const isAiAnalysisMode = !useFormMode && noteEditorMode === 'text';
    if (isAiAnalysisMode) {
      isLoadingAnalysisAfterSaveRef.current = true;
      setIsLoadingAnalysis(true);
      setCompletenessAnalysis(null);
    }
    let contentToSave: string;
    if (noteEditorMode === 'structured') {
      contentToSave = JSON.stringify({
        structured: true,
        schemaType: noteType,
        templateId: selectedTemplateId ?? undefined,
        // Snapshot the custom schema as-is at save time — see
        // StructuredNoteContent.schema for why (template may change later).
        schema: selectedTemplateId ? (customSchema ?? undefined) : undefined,
        values: structuredValues,
      });
    } else if (useFormMode) {
      contentToSave = content;
    } else {
      contentToSave = serializeNoteBodyForApi(content);
    }
    // Template-completeness for compliance: pct of required structured fields
    // filled (same value shown in the "Integridad NOM-004" meter). Only sent
    // for structured notes; other modes send no signal (NULL server-side).
    const completenessPct =
      noteEditorMode === 'structured' && activeSchema
        ? getRequiredProgress(activeSchema, structuredValues).pct
        : undefined;
    try {
      if (currentNoteId) {
        await updateNote(currentNoteId, {
          title,
          content: contentToSave,
          type: noteType,
          completenessPct,
        });
        setSavedTitle(title);
        setSavedContent(content);
        setSavedType(noteType);
        if (noteEditorMode === 'structured')
          setSavedStructuredValues(structuredValues);
        setNoteStatus('draft');
        setLastSavedAt(new Date());
        if (currentNoteId && isAiAnalysisMode) {
          await loadCompletenessAnalysis(currentNoteId);
        }
        toast({
          title: 'Borrador guardado',
          description: 'La nota se ha guardado como borrador',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        const newNote = await createNote({
          content: contentToSave,
          type: noteType,
          title: title || undefined,
          isFollowUpOf: followUpOfRef.current ?? undefined,
          completenessPct,
        });
        setCurrentNoteId(newNote.id);
        setSavedTitle(newNote.title ?? title);
        setSavedContent(content);
        if (newNote.title) setTitle(newNote.title);
        setSavedType(noteType);
        if (noteEditorMode === 'structured')
          setSavedStructuredValues(structuredValues);
        setNoteStatus('draft');
        setLastSavedAt(new Date());
        if (newNote.id && isAiAnalysisMode) {
          await loadCompletenessAnalysis(newNote.id);
        }
        toast({
          title: 'Borrador guardado',
          description: 'La nota se ha guardado como borrador',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(
          error,
          'Ocurrió un error al guardar la nota'
        ),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      isLoadingAnalysisAfterSaveRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSignNote = async () => {
    if (!patientId || !currentNoteId) return;
    if (hasChanges()) await handleSaveDraft();
    onConfirmSignOpen();
  };

  const proceedWithSigning = async (save_anyway = false) => {
    if (!patientId || !currentNoteId) return;
    onConfirmSignClose();
    setIsSubmitting(true);
    const skipAnalysis = save_anyway || useFormMode;
    try {
      await signNote(currentNoteId, skipAnalysis);
      toast({
        title: 'Nota firmada',
        description:
          'La nota quedó firmada y guardada en el expediente. Ya no podrá editarse.',
        status: 'success',
        duration: 4000,
        isClosable: true,
      });
      navigate(patientPathBase);
    } catch (error: unknown) {
      toast({
        title: 'No se pudo firmar',
        description: getErrorMessage(
          error,
          'Ocurrió un error al firmar la nota'
        ),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMissingFields = (): string[] => {
    if (!completenessAnalysis) return [];
    const missingKeys = completenessAnalysis.missing_fields ?? [];
    return missingKeys
      .map((key) => completenessAnalysis.reasoning[key])
      .filter(Boolean);
  };

  const isDraft = noteStatus === 'draft';
  const isNoteIncomplete =
    !!completenessAnalysis && completenessAnalysis.completeness_score < 80;
  /** Borrador guardado y sin cambios locales → acción principal es Firmar; si no, Guardar borrador. */
  const canSignPrimary = isDraft && currentNoteId !== null && !hasChanges();
  const showAnalysisPanel = isDraft && currentNoteId !== null && !useFormMode;

  const saveStateLabel = (() => {
    if (isSubmitting) return 'Guardando…';
    if (lastSavedAt) {
      const diff = Math.max(
        0,
        Math.floor((Date.now() - lastSavedAt.getTime()) / 1000)
      );
      return diff < 3 ? 'Guardado' : `Guardado hace ${diff}s`;
    }
    return 'Sin cambios';
  })();

  // Previous signed notes for this patient (for the "Notas anteriores" side card)
  const previousNotes = notes
    .filter((n) => n.id !== currentNoteId && n.status === 'signed')
    .slice(0, 2);

  return (
    <Container maxW="1280px" px={{ base: 5, md: 10 }} pt={7} pb={14}>
      <PageHead
        crumbs={
          <>
            Pacientes · {patient.firstName} {patient.lastName}
            {' · '}
            {isDraft ? 'Editar nota' : 'Nueva nota'}
          </>
        }
        title={isDraft ? 'Editar nota clínica' : 'Nueva nota clínica'}
        actions={
          <>
            <HStack
              spacing={2}
              fontFamily="mono"
              fontSize="11.5px"
              color="statusSoft.okFg"
              mr={2}
            >
              <Box w="6px" h="6px" borderRadius="full" bg="statusSoft.okFg" />
              <Text>{saveStateLabel}</Text>
            </HStack>
            <Button
              size="sm"
              h="36px"
              colorScheme="brand"
              bg="brand.600"
              color="white"
              _hover={{ bg: 'brand.700' }}
              onClick={canSignPrimary ? handleSignNote : handleSaveDraft}
              isLoading={isSubmitting}
              loadingText={canSignPrimary ? 'Firmando…' : 'Guardando…'}
            >
              {canSignPrimary ? 'Firmar' : 'Guardar borrador'}
            </Button>
          </>
        }
      />

      <Box
        display="grid"
        gridTemplateColumns={{ base: '1fr', lg: '1fr 300px' }}
        gap={5}
        alignItems="start"
      >
        {/* Editor card */}
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="8px"
          overflow="hidden"
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la nota"
            variant="unstyled"
            px="24px"
            pt="22px"
            pb="4px"
            fontSize="22px"
            fontWeight={600}
            letterSpacing="-0.01em"
            _placeholder={{ color: 'paper.500' }}
          />

          <Box
            px="18px"
            py="8px"
            bg={paperBg}
            borderTop="1px solid"
            borderBottom="1px solid"
            borderColor={borderColor}
            fontSize="12px"
            color={subColor}
          >
            <HStack spacing={4} flexWrap="wrap">
              <Text fontFamily="mono" letterSpacing="0.04em" color={labelColor}>
                Tipo
              </Text>
              <Select
                value={
                  useFormMode
                    ? 'form'
                    : selectedTemplateId
                      ? `custom:${selectedTemplateId}`
                      : noteType
                }
                onChange={(e) => handleNoteTypeSelectChange(e.target.value)}
                size="xs"
                w="auto"
                variant="outline"
                bg={cardBg}
                borderColor={softBorder}
                sx={{ fontFamily: 'inherit' }}
              >
                {isWellness ? (
                  <>
                    <option value="psychology-interrogation">
                      Historia Clínica Psicológica Inicial
                    </option>
                    <option value="psychology-evolution">
                      Nota de Sesión Psicológica
                    </option>
                  </>
                ) : (
                  <>
                    <option value="interrogation">Interrogatorio</option>
                    <option value="evolution">Nota de Evolución</option>
                    <option value="exploration">Exploración Física</option>
                  </>
                )}
                {customTemplates.length > 0 && (
                  <optgroup label="Mis tipos de nota">
                    {customTemplates.map((t) => (
                      <option key={t.id} value={`custom:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>

              {/* Form / Texto mode toggle (solo edición de borradores ya estructurados) */}
              {STRUCTURED_NOTE_EDITOR_ENABLED &&
                !useFormMode &&
                activeSchema && (
                  <>
                    <Box w="1px" h="14px" bg={softBorder} flexShrink={0} />
                    <HStack
                      spacing={0}
                      bg={cardBg}
                      border="1px solid"
                      borderColor={softBorder}
                      borderRadius="8px"
                      p="2px"
                    >
                      <Button
                        size="xs"
                        variant="unstyled"
                        display="inline-flex"
                        alignItems="center"
                        gap={1}
                        px={3}
                        h="26px"
                        fontSize="12px"
                        fontWeight={600}
                        borderRadius="6px"
                        bg={
                          noteEditorMode === 'structured'
                            ? 'brand.600'
                            : 'transparent'
                        }
                        color={
                          noteEditorMode === 'structured' ? 'white' : labelColor
                        }
                        _hover={
                          noteEditorMode !== 'structured'
                            ? { bg: 'surface.hover' }
                            : {}
                        }
                        onClick={() => setNoteEditorMode('structured')}
                      >
                        <Icon as={FiList} boxSize="12px" mr={1} />
                        Formulario
                      </Button>
                      <Button
                        size="xs"
                        variant="unstyled"
                        display="inline-flex"
                        alignItems="center"
                        gap={1}
                        px={3}
                        h="26px"
                        fontSize="12px"
                        fontWeight={600}
                        borderRadius="6px"
                        bg={
                          noteEditorMode === 'text'
                            ? 'brand.600'
                            : 'transparent'
                        }
                        color={noteEditorMode === 'text' ? 'white' : labelColor}
                        _hover={
                          noteEditorMode !== 'text'
                            ? { bg: 'surface.hover' }
                            : {}
                        }
                        onClick={() => setNoteEditorMode('text')}
                      >
                        <Icon as={FiType} boxSize="12px" mr={1} />
                        Texto
                      </Button>
                    </HStack>
                  </>
                )}

              {useFormMode && (
                <>
                  <Box w="1px" h="14px" bg={softBorder} />
                  <Text
                    fontFamily="mono"
                    letterSpacing="0.04em"
                    color={labelColor}
                  >
                    Formulario
                  </Text>
                  <Select
                    value={selectedFormId ?? ''}
                    onChange={(e) => handleFormSelect(e.target.value)}
                    placeholder={formsLoading ? 'Cargando…' : 'Seleccionar'}
                    size="xs"
                    w="auto"
                    bg={cardBg}
                    borderColor={softBorder}
                    isDisabled={formsLoading}
                  >
                    {doctorForms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </>
              )}
              {isDraft && noteCreatedAt && (
                <>
                  <Box w="1px" h="14px" bg={softBorder} />
                  <Text
                    fontFamily="mono"
                    letterSpacing="0.04em"
                    color={labelColor}
                  >
                    Fecha
                  </Text>
                  {isEditingDate ? (
                    <HStack spacing={2}>
                      <Input
                        type="datetime-local"
                        size="xs"
                        w="190px"
                        fontFamily="mono"
                        fontSize="12px"
                        value={editingDateValue}
                        onChange={(e) => setEditingDateValue(e.target.value)}
                        bg={cardBg}
                        borderColor={softBorder}
                      />
                      <Button
                        size="xs"
                        colorScheme="brand"
                        bg="brand.600"
                        color="white"
                        _hover={{ bg: 'brand.700' }}
                        onClick={handleConfirmDateChange}
                        isLoading={isUpdatingDate}
                        loadingText="…"
                      >
                        OK
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setIsEditingDate(false)}
                        isDisabled={isUpdatingDate}
                      >
                        ✕
                      </Button>
                    </HStack>
                  ) : (
                    <HStack
                      spacing={1}
                      cursor="pointer"
                      onClick={handleStartEditDate}
                      role="group"
                      _hover={{ color: 'brand.600' }}
                    >
                      <Text
                        fontFamily="mono"
                        fontSize="12px"
                        color={subColor}
                        _groupHover={{ color: 'brand.600' }}
                      >
                        {format(
                          new Date(noteCreatedAt),
                          "d 'de' MMM, yyyy · HH:mm",
                          { locale: es }
                        )}
                      </Text>
                      <Icon
                        as={FiEdit3}
                        boxSize="11px"
                        color={labelColor}
                        opacity={0}
                        _groupHover={{ opacity: 1, color: 'brand.600' }}
                        transition="opacity 0.15s"
                      />
                    </HStack>
                  )}
                </>
              )}
            </HStack>
          </Box>

          <Box minH="480px">
            {useFormMode && selectedFormId ? (
              <Box px="16px" py="8px">
                <FormNoteFiller
                  formId={selectedFormId}
                  initialValues={formFieldValues}
                  onValuesChange={handleFormValuesChange}
                />
              </Box>
            ) : !useFormMode && selectedTemplateId && customSchemaLoading ? (
              <VStack py={16} spacing={3}>
                <Spinner size="lg" color="brand.500" />
              </VStack>
            ) : !useFormMode &&
              noteEditorMode === 'structured' &&
              activeSchema ? (
              <StructuredNoteEditor
                schema={activeSchema}
                values={structuredValues}
                onChange={setStructuredValues}
                lastVitals={lastVitals}
              />
            ) : !useFormMode ? (
              <Box px="16px" py="8px">
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Escribe el contenido de la nota médica..."
                  minHeight="440px"
                />
              </Box>
            ) : (
              <Box p={6}>
                <Text color={subColor}>
                  Selecciona un formulario para comenzar.
                </Text>
              </Box>
            )}
          </Box>

          <HStack
            justify="space-between"
            px="18px"
            py="12px"
            borderTop="1px solid"
            borderColor={borderColor}
            bg={paperBg}
          >
            <HStack
              spacing={3}
              fontFamily="mono"
              fontSize="12px"
              color={labelColor}
            >
              <HStack as="span" spacing={1}>
                <Kbd>Cmd</Kbd>
                <Text>+</Text>
                <Kbd>S</Kbd>
                <Text>guarda</Text>
              </HStack>
              <HStack as="span" spacing={1}>
                <Kbd>Cmd</Kbd>
                <Text>+</Text>
                <Kbd>Enter</Kbd>
                <Text>firma</Text>
              </HStack>
            </HStack>
            <HStack spacing={2}>
              <Button
                variant="ghost"
                size="sm"
                color="text.body"
                onClick={() => navigate(patientPathBase)}
                isDisabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                colorScheme="brand"
                bg="brand.600"
                color="white"
                _hover={{ bg: 'brand.700' }}
                onClick={canSignPrimary ? handleSignNote : handleSaveDraft}
                isLoading={isSubmitting}
                loadingText={canSignPrimary ? 'Firmando…' : 'Guardando…'}
              >
                {canSignPrimary ? 'Firmar' : 'Guardar borrador'}
              </Button>
            </HStack>
          </HStack>
        </Box>

        {/* Side panel — sticky en escritorio: acompaña el scroll del editor */}
        <VStack
          spacing="14px"
          align="stretch"
          position={{ base: 'static', lg: 'sticky' }}
          top={{ lg: '20px' }}
          alignSelf={{ lg: 'flex-start' }}
          maxH={{ lg: 'calc(100vh - 40px)' }}
          overflowY={{ lg: 'auto' }}
        >
          <SideCard heading="Paciente">
            <HStack spacing={3} align="center">
              <Avatar
                size="sm"
                name={`${patient.firstName} ${patient.lastName}`}
                src={patient.avatar}
                bg="statusSoft.infoBg"
                color="brand.700"
              />
              <VStack align="start" spacing={0}>
                <Text fontSize="13.5px" fontWeight={500}>
                  {patient.firstName} {patient.lastName}
                </Text>
                {(() => {
                  const parts: string[] = [];
                  if (patient.dateOfBirth) {
                    parts.push(
                      `${Math.max(
                        0,
                        new Date().getFullYear() -
                          new Date(patient.dateOfBirth).getFullYear()
                      )} años`
                    );
                  }
                  if (patient.gender) {
                    parts.push(
                      patient.gender === 'male'
                        ? 'Hombre'
                        : patient.gender === 'female'
                          ? 'Mujer'
                          : 'Otro'
                    );
                  }
                  const meta = parts.filter(Boolean).join(' · ');
                  return meta ? (
                    <Text
                      fontSize="12px"
                      color={subColor}
                      lineHeight="1.25"
                      mt={0.5}
                    >
                      {meta}
                    </Text>
                  ) : null;
                })()}
              </VStack>
            </HStack>
          </SideCard>
          <CollapsibleSideCard heading="Resumen clínico" defaultOpen={false}>
            <PatientClinicalSummary
              vitals={vitals}
              bloodFallback={patient.bloodType}
              loading={vitalsLoading}
            />
          </CollapsibleSideCard>
          {/* NOM-004 panel: client-side for structured mode, AI for text */}
          {!useFormMode && noteEditorMode === 'structured' && activeSchema ? (
            <Box
              bg={cardBg}
              border="1px solid"
              borderColor={borderColor}
              borderRadius="8px"
              px={4}
              py={3.5}
            >
              <StructuredNomMeter
                schema={activeSchema}
                values={structuredValues}
              />
            </Box>
          ) : (
            <Box
              bg={cardBg}
              border="1px solid"
              borderColor={borderColor}
              borderRadius="8px"
              overflow="hidden"
            >
              <Box
                as="button"
                type="button"
                onClick={() => setIsNomOpen((v) => !v)}
                display="block"
                w="full"
                textAlign="left"
                borderRadius="0"
                px={4}
                py={3.5}
                aria-expanded={isNomOpen}
              >
                <HStack justify="space-between" align="center">
                  <Text
                    fontSize="11px"
                    fontFamily="mono"
                    letterSpacing="0.1em"
                    textTransform="uppercase"
                    color={labelColor}
                    fontWeight={600}
                    userSelect="none"
                  >
                    Integridad NOM‑004
                  </Text>
                  <Icon
                    as={isNomOpen ? FiChevronUp : FiChevronDown}
                    boxSize={4}
                    color={labelColor}
                    flexShrink={0}
                  />
                </HStack>
              </Box>

              {/* Progress siempre visible */}
              <Box px={4} pb={isNomOpen ? 0 : 3.5}>
                {showAnalysisPanel ? (
                  isLoadingAnalysis ? (
                    <HStack
                      spacing={2}
                      fontSize="12.5px"
                      color={subColor}
                      py={1}
                    >
                      <Spinner size="xs" />
                      <Text>Analizando…</Text>
                    </HStack>
                  ) : completenessAnalysis ? (
                    <VStack align="stretch" spacing={2} fontSize="12.5px">
                      <HStack justify="space-between">
                        <Text color={subColor}>Completitud</Text>
                        <Text fontWeight={600} color="brand.600">
                          {completenessAnalysis.completeness_score}%
                        </Text>
                      </HStack>
                      <Box
                        h="4px"
                        bg="paper.200"
                        borderRadius="full"
                        overflow="hidden"
                      >
                        <Box
                          h="100%"
                          w={`${completenessAnalysis.completeness_score}%`}
                          bg={
                            completenessAnalysis.completeness_score >= 90
                              ? 'statusSoft.okFg'
                              : completenessAnalysis.completeness_score >= 70
                                ? 'statusSoft.warnFg'
                                : 'statusSoft.critFg'
                          }
                        />
                      </Box>
                    </VStack>
                  ) : (
                    <Text fontSize="12.5px" color={subColor}>
                      Guarda el borrador para obtener el análisis.
                    </Text>
                  )
                ) : (
                  <Text fontSize="12.5px" color={subColor}>
                    El análisis se genera una vez guardada la nota como
                    borrador.
                  </Text>
                )}
              </Box>

              {/* Detalle colapsable */}
              <Collapse in={isNomOpen} animateOpacity>
                {showAnalysisPanel && completenessAnalysis && (
                  <Box
                    px={4}
                    pt={3}
                    pb={3.5}
                    maxH="260px"
                    overflowY="auto"
                    pr={3}
                  >
                    <VStack align="stretch" spacing={2}>
                      {Object.entries(completenessAnalysis.reasoning ?? {}).map(
                        ([key, value]) => {
                          const missing = (
                            completenessAnalysis.missing_fields ?? []
                          ).includes(key);
                          return (
                            <HStack key={key} align="start" spacing={2}>
                              <Icon
                                as={missing ? FiX : FiCheck}
                                color={
                                  missing
                                    ? 'statusSoft.critFg'
                                    : 'statusSoft.okFg'
                                }
                                boxSize="14px"
                                mt="2px"
                                flexShrink={0}
                                aria-label={missing ? 'Ausente' : 'Presente'}
                              />
                              <Text fontSize="12px" color={subColor}>
                                {value}
                              </Text>
                            </HStack>
                          );
                        }
                      )}
                    </VStack>
                  </Box>
                )}
              </Collapse>
            </Box>
          )}{' '}
          {/* end NOM-004 text mode panel */}
          {previousNotes.length > 0 && (
            <SideCard heading="Notas anteriores">
              <VStack align="stretch" spacing={2}>
                {previousNotes.map((n) => (
                  <ChakraLink
                    key={n.id}
                    fontSize="12.5px"
                    color="text.strong"
                    _hover={{ color: 'brand.600', textDecoration: 'underline' }}
                    onClick={() =>
                      navigate(patientPathBase, {
                        state: { highlightNote: n.id },
                      })
                    }
                  >
                    <Text fontWeight={500} noOfLines={1}>
                      {n.title}
                    </Text>
                    <Text fontSize="11.5px" color={subColor}>
                      {format(new Date(n.createdAt), 'd MMM yyyy', {
                        locale: es,
                      })}
                    </Text>
                  </ChakraLink>
                ))}
              </VStack>
            </SideCard>
          )}
        </VStack>
      </Box>

      {/* Confirm sign modal */}
      <Modal isOpen={isConfirmSignOpen} onClose={onConfirmSignClose} size="lg">
        <ModalOverlay bg="blackAlpha.400" backdropFilter="blur(6px)" />
        <ModalContent
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          borderRadius="10px"
          boxShadow="0 20px 60px -20px rgba(15, 23, 42, 0.25)"
          overflow="hidden"
        >
          <ModalCloseButton
            top="14px"
            right="14px"
            color="text.muted"
            _hover={{ color: 'text.strong', bg: 'surface.hover' }}
          />
          <ModalHeader
            px={7}
            pt={6}
            pb={4}
            borderBottom="1px solid"
            borderColor={borderColor}
          >
            <Box pr={8}>
              <HStack spacing={3} align="center" mb={1.5}>
                <Box
                  w="28px"
                  h="28px"
                  borderRadius="8px"
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  bg="statusSoft.okBg"
                  color="statusSoft.okFg"
                  flexShrink={0}
                >
                  <FiCheckCircle size={18} />
                </Box>
                <Text
                  as="span"
                  fontFamily="mono"
                  fontSize="11px"
                  color={labelColor}
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  fontWeight={500}
                >
                  Firma
                </Text>
              </HStack>
              <Text
                fontSize="18px"
                fontWeight={600}
                letterSpacing="-0.012em"
                color={inkStrong}
              >
                Confirmar firma
              </Text>
            </Box>
          </ModalHeader>
          <ModalBody px={7} py={5}>
            <VStack spacing={3} align="stretch">
              {isNoteIncomplete && (
                <Alert status="warning" borderRadius="8px">
                  <AlertIcon />
                  <Box>
                    <AlertTitle fontSize="sm">
                      Completitud{' '}
                      {completenessAnalysis?.completeness_score ?? 0}%
                    </AlertTitle>
                    <AlertDescription fontSize="sm">
                      La nota parece incompleta según NOM‑004. Puedes seguir
                      editando o firmar de todos modos.
                      {getMissingFields().length > 0 && (
                        <> Campos faltantes: {getMissingFields().join(', ')}.</>
                      )}
                    </AlertDescription>
                  </Box>
                </Alert>
              )}
              <Text fontSize="13.5px" color={bodyColor} lineHeight="1.55">
                Una vez firmada, la nota no podrá ser modificada. Esta acción es
                permanente e irreversible.
              </Text>
              <Box
                bg={paperBg}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="8px"
                p="10px 12px"
              >
                <Text fontSize="13px" color={inkStrong} fontWeight={600}>
                  {isNoteIncomplete
                    ? '¿Deseas firmar la nota de todos modos?'
                    : '¿Deseas continuar con la firma de la nota?'}
                </Text>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter px={7} pt={0} pb={6}>
            <HStack spacing={3} w="full" justify="flex-end">
              <Button
                variant="outline"
                borderColor="line.strong"
                _hover={{ borderColor: 'paper.600', bg: 'surface.hover' }}
                onClick={onConfirmSignClose}
                isDisabled={isSubmitting}
                h="36px"
                px={5}
                borderRadius="10px"
                fontWeight={600}
              >
                {isNoteIncomplete ? 'Seguir editando' : 'Cancelar'}
              </Button>
              <Button
                bg={isNoteIncomplete ? undefined : 'brand.600'}
                color={isNoteIncomplete ? undefined : 'white'}
                colorScheme={isNoteIncomplete ? 'orange' : undefined}
                variant={isNoteIncomplete ? 'outline' : 'solid'}
                _hover={isNoteIncomplete ? undefined : { bg: 'brand.700' }}
                onClick={() => proceedWithSigning(isNoteIncomplete)}
                isLoading={isSubmitting}
                loadingText="Firmando…"
                h="36px"
                px={6}
                borderRadius="10px"
                fontWeight={700}
              >
                {isNoteIncomplete ? 'Firmar de todos modos' : 'Continuar'}
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
};

const SideCard: React.FC<{ heading: string; children: React.ReactNode }> = ({
  heading,
  children,
}) => {
  const cardBg = useColorModeValue('white', 'paper.800');
  const borderColor = useColorModeValue('line.light', 'whiteAlpha.200');
  const labelColor = useColorModeValue('paper.600', 'paper.500');
  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="8px"
      p="14px 16px"
    >
      <Text
        fontSize="11px"
        fontFamily="mono"
        letterSpacing="0.1em"
        textTransform="uppercase"
        color={labelColor}
        fontWeight={600}
        mb="10px"
      >
        {heading}
      </Text>
      {children}
    </Box>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cardBg = useColorModeValue('white', 'paper.800');
  const borderColor = useColorModeValue('line.strong', 'whiteAlpha.300');
  return (
    <Box
      as="kbd"
      fontFamily="mono"
      fontSize="11px"
      px="6px"
      py="1px"
      borderWidth="1px"
      borderColor={borderColor}
      borderBottomWidth="2px"
      borderRadius="4px"
      bg={cardBg}
      color="text.strong"
    >
      {children}
    </Box>
  );
};

export default NoteForm;
