import React from 'react';
import {
  Center,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';

/** Pantalla de carga mientras se restaura la sesión (evita flash en blanco). */
const AuthLoadingScreen: React.FC = () => {
  const muted = useColorModeValue('paper.600', 'paper.400');

  return (
    <Center minH="100vh" bg="surface.page">
      <VStack spacing={4}>
        <Spinner size="lg" color="brand.500" thickness="3px" />
        <Text fontSize="sm" color={muted}>
          Cargando…
        </Text>
      </VStack>
    </Center>
  );
};

export default AuthLoadingScreen;
