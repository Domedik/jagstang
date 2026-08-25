import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Link,
  SimpleGrid,
  Spinner,
  Text,
  Textarea,
  VStack,
  Avatar,
  useToast,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiExternalLink, FiUpload } from 'react-icons/fi';
import PageShell from '../components/PageShell';
import SurfaceCard from '../components/SurfaceCard';
import { AuthField } from '../components/AuthField';
import {
  apiService,
  type ApiDoctorLanding,
  type ApiError,
} from '../services/api';

const DoctorProfile: React.FC = () => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [landing, setLanding] = useState<ApiDoctorLanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  const applyLanding = useCallback((next: ApiDoctorLanding) => {
    setLanding(next);
    setDisplayName(next.display_name ?? '');
    setSpecialty(next.specialty ?? '');
    setBio(next.bio ?? '');
    setNotFound(false);
  }, []);

  const loadLanding = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      applyLanding(await apiService.getDoctorLanding());
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        setLanding(null);
        setNotFound(true);
      } else {
        setLoadError(
          apiError.message || 'No se pudo cargar tu perfil público.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [applyLanding]);

  useEffect(() => {
    void loadLanding();
  }, [loadLanding]);

  const sectionLabelColor = useColorModeValue('paper.600', 'paper.500');
  const sectionTitleColor = useColorModeValue('ink.700', 'paper.50');
  const helpTextColor = useColorModeValue('paper.700', 'paper.400');

  const handleSaveProfile = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      applyLanding(
        await apiService.updateDoctorLanding({
          display_name: displayName.trim(),
          specialty: specialty.trim(),
          bio: bio.trim(),
        })
      );
      toast({
        title: 'Perfil actualizado',
        description: 'Tu información pública ha sido guardada exitosamente',
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar el perfil',
        description:
          (error as ApiError).message || 'Revisa los datos e intenta de nuevo.',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast({
        title: 'Imagen no válida',
        description: 'Usa PNG, JPG o WebP de máximo 5 MB.',
        status: 'warning',
        duration: 4000,
      });
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      applyLanding(await apiService.uploadDoctorLandingPhoto(file));
      toast({
        title: 'Foto actualizada',
        description: 'Tu foto de perfil ha sido actualizada',
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar la foto',
        description:
          (error as ApiError).message ||
          'Elige otra imagen e intenta de nuevo.',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <PageShell
      crumbs="Cuenta"
      title="Información personal"
      sub="Administra tu identidad profesional y datos de contacto."
    >
      <VStack spacing={5} align="stretch">
        {loading && (
          <HStack justify="center" py={12}>
            <Spinner color="brand.600" />
            <Text fontSize="13px" color={helpTextColor}>
              Cargando perfil público…
            </Text>
          </HStack>
        )}
        {!loading && notFound && (
          <Alert status="warning" borderRadius="8px">
            <AlertIcon />
            Este doctor todavía no tiene una landing pública. Pide a un
            administrador que asigne el slug antes de editar el perfil.
          </Alert>
        )}
        {!loading && loadError && (
          <Alert status="error" borderRadius="8px">
            <AlertIcon />
            <HStack justify="space-between" w="full">
              <Text>{loadError}</Text>
              <Button size="xs" variant="outline" onClick={loadLanding}>
                Reintentar
              </Button>
            </HStack>
          </Alert>
        )}
        {!loading && landing && (
          <>
            <SurfaceCard>
              <VStack align="stretch" spacing={5}>
                <Box>
                  <Text
                    fontFamily="mono"
                    fontSize="11px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={sectionLabelColor}
                    mb={1}
                  >
                    Identidad
                  </Text>
                  <Text
                    fontSize="17px"
                    fontWeight={600}
                    color={sectionTitleColor}
                    letterSpacing="-0.01em"
                  >
                    Foto y nombre
                  </Text>
                </Box>

                <HStack spacing={5} align="center">
                  <Avatar
                    size="lg"
                    name={displayName}
                    src={landing.photo_url ?? ''}
                    bgGradient="linear(135deg, brand.400, brand.700)"
                    color="white"
                  />
                  <VStack align="start" spacing={1}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                    <Button
                      leftIcon={<FiUpload />}
                      size="sm"
                      variant="outline"
                      onClick={handleAvatarUpload}
                      isLoading={uploading}
                      isDisabled={saving}
                      borderColor="line.strong"
                      color="ink.700"
                      fontWeight={500}
                    >
                      Cambiar foto
                    </Button>
                    <Text fontSize="12px" color={helpTextColor}>
                      PNG, JPG o WebP. Máximo 5 MB.
                    </Text>
                  </VStack>
                </HStack>
              </VStack>
            </SurfaceCard>

            <SurfaceCard>
              <VStack align="stretch" spacing={5}>
                <Box>
                  <Text
                    fontFamily="mono"
                    fontSize="11px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={sectionLabelColor}
                    mb={1}
                  >
                    Datos profesionales
                  </Text>
                  <Text
                    fontSize="17px"
                    fontWeight={600}
                    color={sectionTitleColor}
                    letterSpacing="-0.01em"
                  >
                    Información básica
                  </Text>
                  <HStack spacing={2} mt={2}>
                    <Text fontSize="12px" color={helpTextColor}>
                      {landing.is_published
                        ? 'Landing publicada'
                        : 'Landing aún no publicada'}
                    </Text>
                    {landing.public_url && (
                      <Link
                        href={landing.public_url}
                        isExternal
                        fontSize="12px"
                        color="brand.600"
                      >
                        Ver perfil{' '}
                        <FiExternalLink style={{ display: 'inline' }} />
                      </Link>
                    )}
                  </HStack>
                </Box>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <AuthField
                    label="Nombre público"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={120}
                  />
                  <AuthField
                    label="Especialidad"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    maxLength={120}
                  />
                </SimpleGrid>
                <FormControl>
                  <FormLabel
                    fontFamily="mono"
                    fontSize="11px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    color={sectionLabelColor}
                  >
                    Biografía
                  </FormLabel>
                  <Textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder="Describe tu experiencia y enfoque de atención."
                    maxLength={1000}
                    rows={5}
                    borderColor="line.strong"
                    resize="vertical"
                  />
                </FormControl>

                <HStack justify="flex-end" pt={2}>
                  <Button
                    onClick={handleSaveProfile}
                    isLoading={saving}
                    loadingText="Guardando…"
                    isDisabled={!displayName.trim() || uploading}
                    bg="brand.600"
                    color="white"
                    h="40px"
                    fontWeight={500}
                    _hover={{ bg: 'brand.700' }}
                  >
                    Guardar cambios
                  </Button>
                </HStack>
              </VStack>
            </SurfaceCard>
          </>
        )}
      </VStack>
    </PageShell>
  );
};

export default DoctorProfile;
