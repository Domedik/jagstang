import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  HStack,
  VStack,
  Button,
  FormControl,
  FormLabel,
  Input,
  Select,
  IconButton,
  useToast,
  Card,
  CardBody,
  SimpleGrid,
  useColorModeValue,
  Textarea,
} from '@chakra-ui/react';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import type { ContactType } from '../types';
import { apiService } from '../services/api';
import PhoneNumberField, {
  phoneNumberFieldUtils,
} from '../components/PhoneNumberField';

const ContactForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const cardBg = useColorModeValue('white', 'paper.800');
  const borderColor = useColorModeValue('line.light', 'line.dark');
  const isEditing = !!id;

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState({ countryIso2: 'MX', nationalNumber: '' });
  const [type, setType] = useState<ContactType | ''>('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [notes, setNotes] = useState('');
  const [loadedPhoneE164, setLoadedPhoneE164] = useState<string | null>(null);

  // Load contact data if editing
  useEffect(() => {
    if (isEditing && id) {
      apiService
        .getContact(id)
        .then((contact) => {
          setFirstName(contact.name);
          setLastName(contact.lastname);
          setAlias(contact.alias || '');
          setEmail(contact.email || '');
          setLoadedPhoneE164(contact.phone || null);
          setPhone({ countryIso2: 'MX', nationalNumber: '' });
          setType((contact.type as ContactType) || 'other');
          setCompany(contact.organization || '');
          setPosition(contact.role || '');
          setNotes('');
        })
        .catch(() => {
          toast({
            title: 'Error',
            description: 'Contacto no encontrado',
            status: 'error',
            duration: 3000,
          });
          navigate('/contacts');
        });
    }
  }, [id, isEditing, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: 'Error',
        description: 'Los campos de nombre y apellido son obligatorios',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!type) {
      toast({
        title: 'Error',
        description: 'Debes seleccionar un tipo de contacto',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const phoneE164 = phoneNumberFieldUtils.toE164(
        phone.countryIso2,
        phone.nationalNumber
      );
      const payload = {
        name: firstName.trim(),
        lastname: lastName.trim(),
        alias: alias.trim() || undefined,
        type: type as string,
        email: email.trim() || undefined,
        phone: phoneE164,
        organization: company.trim() || undefined,
        role: position.trim() || undefined,
      };

      if (isEditing && id) {
        await apiService.updateContact(id, payload);
      } else {
        await apiService.createContact(payload);
      }

      toast({
        title: isEditing ? 'Contacto actualizado' : 'Contacto creado',
        description: isEditing
          ? 'El contacto ha sido actualizado exitosamente'
          : 'El contacto ha sido creado exitosamente',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      navigate('/contacts');
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo guardar el contacto',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  return (
    <Box>
      {/* Header with Gradient */}
      <Box
        bgGradient="linear(135deg, brand.400 0%, brand.600 100%)"
        color="white"
        px={8}
        py={8}
      >
        <Container maxW="container.xl">
          <HStack spacing={4}>
            <IconButton
              aria-label="Volver"
              icon={<FiArrowLeft />}
              onClick={() => navigate('/contacts')}
              variant="ghost"
              colorScheme="whiteAlpha"
              _hover={{
                bg: 'whiteAlpha.300',
              }}
            />
            <Heading size="lg">
              {isEditing ? 'Editar contacto' : 'Nuevo contacto'}
            </Heading>
          </HStack>
        </Container>
      </Box>

      {/* Content */}
      <Container maxW="container.xl" py={8}>
        <form onSubmit={handleSubmit}>
          <VStack spacing={6} align="stretch">
            {/* Basic Information */}
            <Card
              bg={cardBg}
              borderRadius="2xl"
              borderWidth="1px"
              borderColor={borderColor}
            >
              <CardBody>
                <VStack spacing={6} align="stretch">
                  <Heading size="md">Información Básica</Heading>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                    <FormControl isRequired>
                      <FormLabel>Nombre(s)</FormLabel>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Ej: Dr. Carlos"
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>Apellidos</FormLabel>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Ej: Méndez"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Alias (opcional)</FormLabel>
                      <Input
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        placeholder="Ej: Cardiólogo Carlos"
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>Tipo de Contacto</FormLabel>
                      <Select
                        value={type}
                        onChange={(e) => setType(e.target.value as ContactType)}
                        placeholder="Seleccionar tipo"
                      >
                        <option value="colleague">Colega</option>
                        <option value="provider">Proveedor</option>
                        <option value="supplier">Distribuidor</option>
                        <option value="other">Otro</option>
                      </Select>
                    </FormControl>
                  </SimpleGrid>
                </VStack>
              </CardBody>
            </Card>

            {/* Contact Information */}
            <Card
              bg={cardBg}
              borderRadius="2xl"
              borderWidth="1px"
              borderColor={borderColor}
            >
              <CardBody>
                <VStack spacing={6} align="stretch">
                  <Heading size="md">Información de Contacto</Heading>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                    <FormControl>
                      <FormLabel>Correo electrónico</FormLabel>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ejemplo@email.com"
                      />
                    </FormControl>

                    <PhoneNumberField
                      value={phone}
                      onChange={setPhone}
                      e164Value={loadedPhoneE164}
                    />
                  </SimpleGrid>
                </VStack>
              </CardBody>
            </Card>

            {/* Professional Information */}
            <Card
              bg={cardBg}
              borderRadius="2xl"
              borderWidth="1px"
              borderColor={borderColor}
            >
              <CardBody>
                <VStack spacing={6} align="stretch">
                  <Heading size="md">Información Profesional</Heading>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                    <FormControl>
                      <FormLabel>Empresa/Organización</FormLabel>
                      <Input
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Ej: Hospital General"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Posición/Cargo</FormLabel>
                      <Input
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        placeholder="Ej: Cardiólogo"
                      />
                    </FormControl>
                  </SimpleGrid>
                </VStack>
              </CardBody>
            </Card>

            {/* Notes */}
            <Card
              bg={cardBg}
              borderRadius="2xl"
              borderWidth="1px"
              borderColor={borderColor}
            >
              <CardBody>
                <VStack spacing={6} align="stretch">
                  <Heading size="md">Notas</Heading>

                  <FormControl>
                    <FormLabel>Notas adicionales</FormLabel>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Información adicional sobre el contacto..."
                      rows={4}
                    />
                  </FormControl>
                </VStack>
              </CardBody>
            </Card>

            {/* Action Buttons */}
            <HStack justify="flex-end" spacing={3}>
              <Button variant="ghost" onClick={() => navigate('/contacts')}>
                Cancelar
              </Button>
              <Button type="submit" colorScheme="teal" size="lg">
                {isEditing ? 'Guardar cambios' : 'Crear contacto'}
              </Button>
            </HStack>
          </VStack>
        </form>
      </Container>
    </Box>
  );
};

export default ContactForm;
