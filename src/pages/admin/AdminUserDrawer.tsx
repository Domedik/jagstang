import React, { useEffect, useState } from 'react';
import {
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Select,
  Text,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import { FiCopy, FiRefreshCw } from 'react-icons/fi';
import FormDrawer from '../../components/FormDrawer';
import {
  FIELD_LABEL_STYLES,
  INPUT_STYLES,
} from '../../components/patient-appointment/styles';
import { apiService } from '../../services/api';

/** Mismos valores que el enum `user_role` del backend (duosonic valida `oneof`). */
const ROLE_OPTIONS = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'admin', label: 'Administrador' },
  { value: 'assistant', label: 'Asistente' },
  { value: 'nurse', label: 'Enfermero / a' },
];

const PASSWORD_MIN_LENGTH = 8;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Contraseña aleatoria con al menos una minúscula, mayúscula, dígito y
 * símbolo — las mismas garantías que `_random_password` en
 * backstage/scripts/create_cognito_user.py (política del user pool).
 */
const generatePassword = (length = 16): string => {
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^&*';
  const all = lowers + uppers + digits + symbols;
  const pick = (set: string, count: number) =>
    Array.from(
      crypto.getRandomValues(new Uint32Array(count)),
      (v) => set[v % set.length]
    );
  const chars = [
    ...pick(lowers, 1),
    ...pick(uppers, 1),
    ...pick(digits, 1),
    ...pick(symbols, 1),
    ...pick(all, Math.max(0, length - 4)),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

interface AdminUserDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fires after a successful create so the list can refetch. */
  onCreated: () => void;
}

const AdminUserDrawer: React.FC<AdminUserDrawerProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('doctor');
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setFamilyName('');
      setEmail('');
      setRole('doctor');
      setSlug('');
      setPassword(generatePassword());
    }
  }, [isOpen]);

  const slugNormalized = slug.trim().toLowerCase();
  const slugOk =
    role !== 'doctor' ||
    slugNormalized === '' ||
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugNormalized);

  const canSubmit =
    !!name.trim() &&
    !!familyName.trim() &&
    EMAIL_RE.test(email.trim()) &&
    password.length >= PASSWORD_MIN_LENGTH &&
    slugOk;

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast({ title: 'Contraseña copiada', status: 'info', duration: 2000 });
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Copia la contraseña manualmente.',
        status: 'warning',
        duration: 3000,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await apiService.createAdminUser({
        email: email.trim(),
        name: name.trim(),
        family_name: familyName.trim(),
        role,
        password,
        ...(role === 'doctor' && slugNormalized
          ? { slug: slugNormalized }
          : {}),
      });
      toast({
        title: 'Usuario creado',
        description: `${name.trim()} ${familyName.trim()} · ${email.trim()}. Comparte la contraseña de forma segura.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const { status, message } = (err ?? {}) as {
        status?: number;
        message?: string;
      };
      let description = message || 'No se pudo crear el usuario.';
      const msg = (message || '').toUpperCase();
      if (status === 409 && msg.includes('SLUG')) {
        description =
          'Ese slug ya está en uso. Elige otro para la landing del doctor.';
      } else if (status === 409) {
        description = 'Ya existe un usuario con ese correo.';
      } else if (status === 400 && msg.includes('SLUG')) {
        description =
          'El slug solo puede usar letras minúsculas, números y guiones.';
      } else if (status === 400) {
        description =
          'Datos inválidos o la contraseña no cumple la política de seguridad.';
      }
      toast({
        title: 'Error al crear usuario',
        description,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      crumb="Admin · Usuarios"
      title="Nuevo usuario"
      sub="Crea la cuenta de acceso y su registro en el equipo; comparte la contraseña con el usuario de forma segura."
      onSubmit={handleSubmit}
      submitLabel="Crear usuario"
      submitLoadingText="Creando…"
      isSubmitting={isSubmitting}
      isSubmitDisabled={!canSubmit}
    >
      <Flex direction="column" gap={4}>
        <HStack spacing={3} align="flex-start">
          <FormControl isRequired>
            <FormLabel {...FIELD_LABEL_STYLES}>Nombre</FormLabel>
            <Input
              {...INPUT_STYLES}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre(s)"
              maxLength={32}
              autoFocus
            />
          </FormControl>
          <FormControl isRequired>
            <FormLabel {...FIELD_LABEL_STYLES}>Apellidos</FormLabel>
            <Input
              {...INPUT_STYLES}
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Apellidos"
              maxLength={32}
            />
          </FormControl>
        </HStack>

        <FormControl isRequired>
          <FormLabel {...FIELD_LABEL_STYLES}>Correo electrónico</FormLabel>
          <Input
            {...INPUT_STYLES}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@clinica.mx"
          />
        </FormControl>

        <FormControl isRequired>
          <FormLabel {...FIELD_LABEL_STYLES}>Rol</FormLabel>
          <Select
            {...INPUT_STYLES}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormControl>

        {role === 'doctor' && (
          <FormControl isInvalid={slugNormalized !== '' && !slugOk}>
            <FormLabel {...FIELD_LABEL_STYLES}>
              Slug de landing (opcional)
            </FormLabel>
            <Input
              {...INPUT_STYLES}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ej. maria-lopez"
              maxLength={64}
              autoComplete="off"
            />
            <Text mt={1.5} fontSize="11.5px" color="text.label">
              URL pública del doctor:{' '}
              {`{clínica}.clineo.mx/${slugNormalized || 'slug'}/`}. Solo
              minúsculas, números y guiones. Si ya está en uso, no se crea la
              cuenta.
            </Text>
          </FormControl>
        )}

        <FormControl isRequired>
          <FormLabel {...FIELD_LABEL_STYLES}>Contraseña</FormLabel>
          <InputGroup>
            <Input
              {...INPUT_STYLES}
              fontFamily="mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              pr="76px"
            />
            <InputRightElement w="76px" h="36px">
              <Tooltip label="Generar contraseña">
                <IconButton
                  aria-label="Generar contraseña"
                  icon={<FiRefreshCw />}
                  size="xs"
                  variant="ghost"
                  onClick={() => setPassword(generatePassword())}
                />
              </Tooltip>
              <Tooltip label="Copiar contraseña">
                <IconButton
                  aria-label="Copiar contraseña"
                  icon={<FiCopy />}
                  size="xs"
                  variant="ghost"
                  onClick={copyPassword}
                />
              </Tooltip>
            </InputRightElement>
          </InputGroup>
          <Text mt={1.5} fontSize="11.5px" color="text.label">
            El usuario iniciará sesión con su correo y esta contraseña.
          </Text>
        </FormControl>
      </Flex>
    </FormDrawer>
  );
};

export default AdminUserDrawer;
