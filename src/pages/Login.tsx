import React, { useState } from 'react';
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  useToast,
  Link,
  useColorModeValue,
} from '@chakra-ui/react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { AuthField, PasswordField } from '../components/AuthField';
import { getSupportMailto, SUPPORT_EMAIL } from '../config/support';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const subColor = useColorModeValue('paper.700', 'paper.400');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: 'Datos incompletos',
        description: 'Por favor ingresa tu email y contraseña',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      await login({ email, password });
      toast({
        title: 'Bienvenido',
        description: 'Has iniciado sesión exitosamente',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      navigate('/');
    } catch {
      toast({
        title: 'Error de autenticación',
        description: 'Email o contraseña incorrectos',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <AuthLayout
      crumbs=""
      title="Iniciar sesión"
      sub=""
      footer={
        <HStack justify="space-between" px={1}>
          <Text fontSize="12px" color={subColor}>
            ¿Problemas para acceder?{' '}
            <Link
              href={getSupportMailto()}
              color="brand.600"
              fontWeight={500}
              isExternal
              aria-label={`Contactar a soporte (${SUPPORT_EMAIL})`}
            >
              Contacta al soporte
            </Link>
          </Text>
        </HStack>
      }
    >
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <VStack spacing={4} align="stretch">
          <AuthField
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
            isRequired
          />

          <Box>
            <PasswordField
              label="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              isRequired
            />
            <HStack justify="flex-end" mt={1.5}>
              <Link
                as={RouterLink}
                to="/forgot-password"
                fontSize="12px"
                color="brand.600"
                fontWeight={500}
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </HStack>
          </Box>

          <Button
            type="submit"
            size="md"
            h="40px"
            w="full"
            colorScheme="brand"
            bg="brand.600"
            color="white"
            _hover={{ bg: 'brand.700' }}
            isLoading={isLoading}
            loadingText="Iniciando sesión..."
            mt={1}
          >
            Iniciar sesión
          </Button>
        </VStack>
      </form>
    </AuthLayout>
  );
};

export default Login;
