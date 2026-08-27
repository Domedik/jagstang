import React from 'react';
import {
  Box,
  Flex,
  VStack,
  Text,
  Avatar,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  useColorMode,
  useColorModeValue,
  useBreakpointValue,
  Icon,
  IconButton,
} from '@chakra-ui/react';
import {
  FiHome,
  FiUsers,
  FiCalendar,
  FiLogOut,
  FiUser,
  FiActivity,
  FiBook,
  FiBookOpen,
  FiBriefcase,
  FiSun,
  FiMoon,
} from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ClineoLogo from './ClineoLogo';
import { getRoleLabel } from '../utils/roleLabels';
import {
  HOME_NAV_ENABLED,
  PATIENTS_NAV_ENABLED,
  CALENDAR_NAV_ENABLED,
  TEAM_NAV_ENABLED,
  CONTACTS_NAV_ENABLED,
  LIBRARY_NAV_ENABLED,
  COMPLIANCE_NAV_ENABLED,
} from '../config/features';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  path: string;
  isActive: boolean;
  isDisabled?: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({
  icon: ItemIcon,
  label,
  isActive,
  isDisabled,
  onClick,
}) => {
  return (
    <Box
      as="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      opacity={isDisabled ? 0.4 : 1}
      position="relative"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="6px"
      py="10px"
      px="8px"
      borderRadius="8px"
      bg={isActive ? 'rgba(76,183,215,0.12)' : 'transparent'}
      color={isActive ? 'sidebar.fg' : 'sidebar.muted'}
      transition="color .12s, background .12s"
      _hover={
        isDisabled
          ? undefined
          : {
              color: 'sidebar.fg',
              bg: isActive ? 'rgba(76,183,215,0.18)' : 'rgba(255,255,255,0.04)',
            }
      }
      _before={
        isActive
          ? {
              content: '""',
              position: 'absolute',
              left: '-10px',
              top: '14px',
              bottom: '14px',
              width: '3px',
              bg: 'brand.400',
              borderRadius: '0 2px 2px 0',
            }
          : undefined
      }
    >
      <Icon
        as={ItemIcon}
        boxSize="20px"
        strokeWidth={1.75}
        color={isActive ? 'brand.400' : 'currentColor'}
      />
      <Text
        fontSize="10.5px"
        fontWeight={500}
        letterSpacing="0.01em"
        lineHeight="1"
        textAlign="center"
      >
        {label}
      </Text>
    </Box>
  );
};

interface BottomNavItemProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  isDisabled?: boolean;
  onClick: () => void;
}

const BottomNavItem: React.FC<BottomNavItemProps> = ({
  icon: ItemIcon,
  label,
  isActive,
  isDisabled,
  onClick,
}) => {
  return (
    <Box
      as="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      opacity={isDisabled ? 0.4 : 1}
      position="relative"
      flex={1}
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap="3px"
      py="8px"
      color={isActive ? 'sidebar.fg' : 'sidebar.muted'}
      transition="color .12s"
      _active={isDisabled ? undefined : { bg: 'rgba(255,255,255,0.04)' }}
      _before={
        isActive
          ? {
              content: '""',
              position: 'absolute',
              top: 0,
              left: '24%',
              right: '24%',
              height: '2px',
              bg: 'brand.400',
              borderRadius: '0 0 2px 2px',
            }
          : undefined
      }
    >
      <Icon
        as={ItemIcon}
        boxSize="20px"
        strokeWidth={1.75}
        color={isActive ? 'brand.400' : 'currentColor'}
      />
      <Text
        fontSize="10px"
        fontWeight={500}
        letterSpacing="0.01em"
        lineHeight="1"
      >
        {label}
      </Text>
    </Box>
  );
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { doctor, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { colorMode, toggleColorMode } = useColorMode();

  const bgColor = useColorModeValue('surface.page', 'background.dark');

  // Tokens del menú flotante (alineados con AuthLayout)
  const menuBg = useColorModeValue('white', 'paper.800');
  const menuBorder = useColorModeValue('line.light', 'whiteAlpha.200');
  /** Texto del menú: debe contrastar con `menuBg` (no heredar `sidebar.fg` del padre). */
  const menuFg = useColorModeValue('ink.700', 'paper.50');
  const menuLabelColor = useColorModeValue('paper.600', 'paper.400');
  const menuNameColor = useColorModeValue('ink.700', 'paper.50');
  const menuItemHoverBg = useColorModeValue('paper.100', 'whiteAlpha.100');
  const menuIconColor = useColorModeValue('paper.600', 'paper.400');

  const hideNom = (doctor?.role ?? '').toUpperCase() === 'WELLNESS';
  // Miembros de equipo (nurse/assistant): navegación reducida a lo que sus
  // grants permiten — enfermería ve pacientes, asistentes ven la agenda.
  const userRole = (doctor?.role ?? '').toUpperCase();
  const isNurse = userRole === 'NURSE';
  const isAssistant = userRole === 'ASSISTANT';
  const isTeamMember = isNurse || isAssistant;
  const navItems = isTeamMember
    ? [
        ...(PATIENTS_NAV_ENABLED && isNurse
          ? [{ icon: FiUsers, label: 'Pacientes', path: '/patients' }]
          : []),
        ...(CALENDAR_NAV_ENABLED && isAssistant
          ? [{ icon: FiCalendar, label: 'Calendario', path: '/calendar' }]
          : []),
        {
          icon: FiBriefcase,
          label: 'Equipo',
          path: '/team',
          disabled: !TEAM_NAV_ENABLED,
        },
      ]
    : [
        ...(HOME_NAV_ENABLED
          ? [{ icon: FiHome, label: 'Inicio', path: '/' }]
          : []),
        ...(PATIENTS_NAV_ENABLED
          ? [{ icon: FiUsers, label: 'Pacientes', path: '/patients' }]
          : []),
        ...(CALENDAR_NAV_ENABLED
          ? [{ icon: FiCalendar, label: 'Calendario', path: '/calendar' }]
          : []),
        {
          icon: FiBriefcase,
          label: 'Equipo',
          path: '/team',
          disabled: !TEAM_NAV_ENABLED,
        },
        ...(CONTACTS_NAV_ENABLED
          ? [{ icon: FiBook, label: 'Contactos', path: '/contacts' }]
          : []),
        ...(LIBRARY_NAV_ENABLED
          ? [{ icon: FiBookOpen, label: 'Biblioteca', path: '/library' }]
          : []),
        ...(COMPLIANCE_NAV_ENABLED && !hideNom
          ? [{ icon: FiActivity, label: 'NOM', path: '/compliance' }]
          : []),
      ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isItemActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return (
      location.pathname === path ||
      (path === '/contacts' && location.pathname.startsWith('/contacts')) ||
      (path === '/patients' && location.pathname.startsWith('/patients')) ||
      (path === '/library' && location.pathname.startsWith('/library'))
    );
  };

  const role = (doctor?.role ?? '').toUpperCase();

  /** Rail: visible desde `md`; un poco más chico en tablet que en escritorio ancho. */
  const railLogoPx = useBreakpointValue({ md: 10, lg: 12 }) ?? 12;
  /** Header móvil: barra 56px; 24px se ve pesado en teléfonos estrechos. */
  const mobileHeaderLogoPx = useBreakpointValue({ base: 8 }) ?? 8;

  const themeToggle = (
    <Tooltip
      label={colorMode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      placement="bottom"
    >
      <IconButton
        aria-label="Cambiar tema"
        icon={
          <Icon as={colorMode === 'dark' ? FiSun : FiMoon} boxSize="16px" />
        }
        onClick={toggleColorMode}
        size="sm"
        variant="ghost"
        color="sidebar.muted"
        _hover={{ color: 'sidebar.fg', bg: 'rgba(255,255,255,0.06)' }}
        _active={{ bg: 'rgba(255,255,255,0.1)' }}
      />
    </Tooltip>
  );

  const userMenu = doctor && (
    <Menu
      placement="bottom-end"
      gutter={8}
      // `absolute` (default de Popper) queda dentro del rail con `overflowY: auto`
      // y el `MenuList` se recorta al ancho del sidebar; `fixed` evita ese clip.
      strategy="fixed"
    >
      <MenuButton as={Box} cursor="pointer">
        <Tooltip
          label={`${doctor.firstName} ${doctor.lastName}`}
          placement="bottom"
        >
          <Avatar
            size="sm"
            w="36px"
            h="36px"
            name={`${doctor.firstName} ${doctor.lastName}`}
            src={doctor.avatar || undefined}
            bgGradient="linear(135deg, brand.400, brand.700)"
            color="white"
            fontSize="13px"
            fontWeight={600}
            _hover={{ transform: 'scale(1.05)' }}
            transition="all 0.2s"
          />
        </Tooltip>
      </MenuButton>
      <MenuList
        zIndex={1400}
        bg={menuBg}
        color={menuFg}
        border="1px solid"
        borderColor={menuBorder}
        borderRadius="8px"
        boxShadow="lg"
        py={2}
        minW="240px"
        sx={{
          '& .chakra-menu__icon-wrapper': { color: menuIconColor },
        }}
      >
        <Box px={3} py={2}>
          <Text
            fontSize="13.5px"
            fontWeight={600}
            color={menuNameColor}
            lineHeight="1.3"
            noOfLines={1}
          >
            {doctor.firstName} {doctor.lastName}
          </Text>
          {role && (
            <Text
              fontFamily="mono"
              fontSize="10.5px"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color={menuLabelColor}
              mt={0.5}
            >
              {getRoleLabel(role)}
            </Text>
          )}
        </Box>
        <MenuDivider borderColor={menuBorder} my={1} />
        <MenuItem
          icon={<FiUser />}
          onClick={() => navigate('/profile')}
          fontSize="13.5px"
          color={menuFg}
          bg={menuBg}
          _hover={{ bg: menuItemHoverBg, color: menuFg }}
          _focus={{ bg: menuItemHoverBg, color: menuFg }}
        >
          Información personal
        </MenuItem>
        {LIBRARY_NAV_ENABLED && (
          <MenuItem
            icon={<FiBookOpen />}
            onClick={() => navigate('/library')}
            fontSize="13.5px"
            color={menuFg}
            bg={menuBg}
            _hover={{ bg: menuItemHoverBg, color: menuFg }}
            _focus={{ bg: menuItemHoverBg, color: menuFg }}
          >
            Biblioteca
          </MenuItem>
        )}
        <MenuDivider borderColor={menuBorder} my={1} />
        <MenuItem
          icon={<FiLogOut />}
          onClick={handleLogout}
          fontSize="13.5px"
          color={menuFg}
          bg={menuBg}
          _hover={{ bg: menuItemHoverBg, color: menuFg }}
          _focus={{ bg: menuItemHoverBg, color: menuFg }}
        >
          Cerrar sesión
        </MenuItem>
      </MenuList>
    </Menu>
  );

  return (
    <Flex direction={{ base: 'column', md: 'row' }} minH="100vh">
      {/* Mobile top header (sticky) */}
      <Flex
        display={{ base: 'flex', md: 'none' }}
        position="sticky"
        top={0}
        zIndex={20}
        h="56px"
        px={4}
        bg="sidebar.bg"
        color="sidebar.fg"
        borderBottom="1px solid"
        borderColor="whiteAlpha.100"
        alignItems="center"
        justifyContent="space-between"
        flexShrink={0}
      >
        <Flex
          as="button"
          alignItems="center"
          gap={2}
          onClick={() => navigate('/')}
        >
          <ClineoLogo variant="icon" color="white" size={mobileHeaderLogoPx} />
        </Flex>
        <Flex alignItems="center" gap={1}>
          {themeToggle}
          {userMenu}
        </Flex>
      </Flex>

      {/* Desktop sidebar rail: no estirar con páginas altas (p. ej. Calendario); el pie queda anclado al viewport */}
      <Box
        display={{ base: 'none', md: 'flex' }}
        w="92px"
        bg="sidebar.bg"
        color="sidebar.fg"
        flexDirection="column"
        pt="18px"
        pb="20px"
        flexShrink={0}
        alignSelf="flex-start"
        minH={{ md: '100vh' }}
        maxH={{ md: '100vh' }}
        position={{ md: 'sticky' }}
        top={{ md: 0 }}
        zIndex={{ md: 30 }}
        overflowY={{ md: 'auto' }}
      >
        <Flex h="64px" alignItems="center" justifyContent="center">
          <ClineoLogo variant="icon" color="white" size={railLogoPx} />
        </Flex>

        <VStack
          as="nav"
          spacing="2px"
          px="10px"
          flex={1}
          align="stretch"
          pt="12px"
        >
          {navItems.map((item) => (
            <NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              isActive={isItemActive(item.path)}
              isDisabled={item.disabled}
              onClick={() => navigate(item.path)}
            />
          ))}
        </VStack>

        <VStack
          spacing="10px"
          px="10px"
          pt="10px"
          borderTop="1px solid"
          borderColor="whiteAlpha.100"
          align="center"
        >
          {themeToggle}
          {userMenu}
        </VStack>
      </Box>

      {/* Page content */}
      <Box
        flex={1}
        bg={bgColor}
        minW={0}
        // Reservar espacio para el bottom-nav fijo en mobile (64px + safe area)
        pb={{
          base: 'calc(64px + env(safe-area-inset-bottom))',
          md: 0,
        }}
      >
        {children}
      </Box>

      {/* Mobile bottom tab bar (fixed) */}
      <Flex
        display={{ base: 'flex', md: 'none' }}
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        zIndex={20}
        bg="sidebar.bg"
        color="sidebar.fg"
        borderTop="1px solid"
        borderColor="whiteAlpha.200"
        h="64px"
        pb="env(safe-area-inset-bottom)"
        alignItems="stretch"
        justifyContent="space-around"
      >
        {navItems.map((item) => (
          <BottomNavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            isActive={isItemActive(item.path)}
            isDisabled={item.disabled}
            onClick={() => navigate(item.path)}
          />
        ))}
      </Flex>
    </Flex>
  );
};

export default Layout;
