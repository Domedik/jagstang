import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Input,
  IconButton,
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
  SPECIALTY_ICON_OPTIONS,
  SOCIAL_LINK_FIELDS,
  emptySocialLinks,
  socialLinksFromApi,
  socialLinksToApi,
  type SpecialtyIconKey,
  type SocialLinkKey,
} from '../data/landingProfile';
import {
  apiService,
  type ApiDoctorLanding,
  type ApiError,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const DoctorProfile: React.FC = () => {
  const toast = useToast();
  const { updateDoctor } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [specialtyIcon, setSpecialtyIcon] = useState<SpecialtyIconKey | ''>('');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState(emptySocialLinks);
  const [landing, setLanding] = useState<ApiDoctorLanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  const applyLanding = useCallback(
    (next: ApiDoctorLanding) => {
      setLanding(next);
      setDisplayName(next.display_name ?? '');
      setSpecialty(next.specialty ?? '');
      const icon = next.specialty_icon?.trim() ?? '';
      setSpecialtyIcon(
        SPECIALTY_ICON_OPTIONS.some((option) => option.key === icon)
          ? (icon as SpecialtyIconKey)
          : ''
      );
      setBio(next.bio ?? '');
      setSocialLinks(socialLinksFromApi(next.social_links));
      setNotFound(false);
      if (next.photo_url) {
        updateDoctor({ avatar: next.photo_url });
      }
    },
    [updateDoctor]
  );

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
  const iconButtonBorder = useColorModeValue('line.strong', 'whiteAlpha.300');
  const iconButtonSelectedBg = useColorModeValue('brand.50', 'whiteAlpha.200');
  const iconButtonSelectedBorder = useColorModeValue('brand.500', 'brand.300');
  const inputBg = useColorModeValue('white', 'paper.900');

  const handleSaveProfile = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      applyLanding(
        await apiService.updateDoctorLanding({
          display_name: displayName.trim(),
          specialty: specialty.trim(),
          specialty_icon: specialtyIcon || null,
          bio: bio.trim(),
          social_links: socialLinksToApi(socialLinks),
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

  const updateSocialLink = (key: SocialLinkKey, value: string) => {
    setSocialLinks((current) => ({ ...current, [key]: value }));
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
                    Icono de especialidad
                  </FormLabel>
                  <Text fontSize="12px" color={helpTextColor} mb={3}>
                    Aparece junto a tu especialidad en la landing pública.
                  </Text>
                  <Grid
                    templateColumns={{
                      base: 'repeat(5, minmax(0, 1fr))',
                      md: 'repeat(10, minmax(0, 1fr))',
                    }}
                    gap={2}
                  >
                    {SPECIALTY_ICON_OPTIONS.map(({ key, label, Icon }) => {
                      const selected = specialtyIcon === key;
                      return (
                        <IconButton
                          key={key}
                          aria-label={label}
                          title={label}
                          icon={<Icon size={18} />}
                          size="sm"
                          variant="outline"
                          borderColor={
                            selected
                              ? iconButtonSelectedBorder
                              : iconButtonBorder
                          }
                          bg={selected ? iconButtonSelectedBg : 'transparent'}
                          color={selected ? 'brand.700' : 'ink.600'}
                          onClick={() => setSpecialtyIcon(selected ? '' : key)}
                        />
                      );
                    })}
                  </Grid>
                </FormControl>

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
                    Presencia en línea
                  </Text>
                  <Text
                    fontSize="17px"
                    fontWeight={600}
                    color={sectionTitleColor}
                    letterSpacing="-0.01em"
                  >
                    Redes sociales
                  </Text>
                  <Text fontSize="12px" color={helpTextColor} mt={2}>
                    Enlaces opcionales visibles en tu landing pública. Usa URLs
                    que comiencen con https://
                  </Text>
                </Box>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  {SOCIAL_LINK_FIELDS.map(
                    ({ key, label, placeholder, Icon }) => (
                      <FormControl key={key}>
                        <FormLabel
                          fontFamily="mono"
                          fontSize="11px"
                          letterSpacing="0.08em"
                          textTransform="uppercase"
                          color={sectionLabelColor}
                        >
                          <HStack spacing={2}>
                            <Icon size={14} />
                            <Text as="span">{label}</Text>
                          </HStack>
                        </FormLabel>
                        <Input
                          h="40px"
                          fontSize="14px"
                          borderRadius="6px"
                          borderColor="line.strong"
                          bg={inputBg}
                          value={socialLinks[key]}
                          onChange={(event) =>
                            updateSocialLink(key, event.target.value)
                          }
                          placeholder={placeholder}
                          _hover={{ borderColor: 'paper.600' }}
                          _focus={{
                            borderColor: 'brand.500',
                            boxShadow: '0 0 0 3px rgba(76,183,215,0.18)',
                          }}
                        />
                      </FormControl>
                    )
                  )}
                </SimpleGrid>

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
