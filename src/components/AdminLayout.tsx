import React from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Avatar,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Icon,
  IconButton,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  FiHome,
  FiUsers,
  FiFileText,
  FiShield,
  FiActivity,
  FiLogOut,
  FiSun,
  FiMoon,
} from 'react-icons/fi';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ClineoLogo from './ClineoLogo';
import {
  ADMIN_INVOICES_NAV_ENABLED,
  ADMIN_COMPLIANCE_NAV_ENABLED,
} from '../config/features';

const NAV_ITEMS = [
  { icon: FiHome, label: 'Panel', path: '/admin/dashboard' },
  { icon: FiUsers, label: 'Usuarios', path: '/admin/usuarios' },
  ...(ADMIN_INVOICES_NAV_ENABLED
    ? [{ icon: FiFileText, label: 'Facturas', path: '/admin/facturas' }]
    : []),
  ...(ADMIN_COMPLIANCE_NAV_ENABLED
    ? [{ icon: FiActivity, label: 'Cumplimiento', path: '/admin/compliance' }]
    : []),
  { icon: FiShield, label: 'Registro de auditoría', path: '/admin/audit-log' },
];

interface AdminNavItemProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const AdminNavItem: React.FC<AdminNavItemProps> = ({
  icon: ItemIcon,
  label,
  isActive,
  onClick,
}) => (
  <Box
    as="button"
    onClick={onClick}
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
    _hover={{
      color: 'sidebar.fg',
      bg: isActive ? 'rgba(76,183,215,0.18)' : 'rgba(255,255,255,0.04)',
    }}
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

const AdminLayout: React.FC = () => {
  const { doctor, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { colorMode, toggleColorMode } = useColorMode();

  const bgColor = useColorModeValue('surface.page', 'background.dark');
  const menuBg = useColorModeValue('white', 'paper.800');
  const menuBorder = useColorModeValue('line.light', 'whiteAlpha.200');
  const menuFg = useColorModeValue('ink.700', 'paper.50');
  const menuLabelColor = useColorModeValue('paper.600', 'paper.400');
  const menuItemHoverBg = useColorModeValue('paper.100', 'whiteAlpha.100');
  const menuIconColor = useColorModeValue('paper.600', 'paper.400');

  const isActive = (path: string) => location.pathname.startsWith(path);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = doctor
    ? `${doctor.firstName?.[0] ?? ''}${doctor.lastName?.[0] ?? ''}`.toUpperCase()
    : '';

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
    <Menu placement="bottom-end" gutter={8} strategy="fixed">
      <MenuButton as={Box} cursor="pointer">
        <Tooltip
          label={`${doctor.firstName} ${doctor.lastName}`}
          placement="bottom"
        >
          <Avatar
            size="sm"
            w="34px"
            h="34px"
            name={`${doctor.firstName} ${doctor.lastName}`}
            getInitials={() => initials}
            src={doctor.avatar || undefined}
            bgGradient="linear(135deg, brand.400, brand.700)"
            color="white"
            fontSize="12px"
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
        minW="220px"
        sx={{ '& .chakra-menu__icon-wrapper': { color: menuIconColor } }}
      >
        <Box px={3} py={2}>
          <Text
            fontSize="13.5px"
            fontWeight={600}
            color={menuFg}
            lineHeight="1.3"
            noOfLines={1}
          >
            {doctor.firstName} {doctor.lastName}
          </Text>
          <Text
            fontFamily="mono"
            fontSize="10.5px"
            letterSpacing="0.08em"
            textTransform="uppercase"
            color={menuLabelColor}
            mt={0.5}
          >
            Admin
          </Text>
        </Box>
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
      {/* Mobile top bar: logo + label, horizontal nav, avatar menu */}
      <Flex
        display={{ base: 'flex', md: 'none' }}
        direction="column"
        position="sticky"
        top={0}
        zIndex={20}
        bg="sidebar.bg"
        color="sidebar.fg"
        borderBottom="1px solid"
        borderColor="whiteAlpha.100"
        flexShrink={0}
      >
        <Flex
          h="56px"
          px={4}
          alignItems="center"
          justifyContent="space-between"
        >
          <Flex alignItems="center" gap={2}>
            <ClineoLogo variant="icon" color="white" size={8} />
            <Text
              fontFamily="mono"
              fontSize="9px"
              fontWeight={600}
              letterSpacing="0.14em"
              color="brand.400"
            >
              ADMIN
            </Text>
          </Flex>
          <Flex alignItems="center" gap={1}>
            {themeToggle}
            {userMenu}
          </Flex>
        </Flex>
        <HStack spacing={1} px={2} pb={2} overflowX="auto">
          {NAV_ITEMS.map((item) => (
            <Box key={item.path} flexShrink={0}>
              <AdminNavItem
                icon={item.icon}
                label={item.label}
                isActive={isActive(item.path)}
                onClick={() => navigate(item.path)}
              />
            </Box>
          ))}
        </HStack>
      </Flex>

      {/* Desktop sidebar rail */}
      <Box
        display={{ base: 'none', md: 'flex' }}
        w="92px"
        bg="sidebar.bg"
        color="sidebar.fg"
        flexDirection="column"
        alignItems="center"
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
        <Flex h="56px" alignItems="center" justifyContent="center">
          <ClineoLogo variant="icon" color="white" size={12} />
        </Flex>
        <Text
          fontFamily="mono"
          fontSize="9px"
          fontWeight={600}
          letterSpacing="0.14em"
          color="brand.400"
          mb="18px"
        >
          ADMIN
        </Text>

        <VStack as="nav" spacing="2px" px="10px" w="100%" align="stretch">
          {NAV_ITEMS.map((item) => (
            <AdminNavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              isActive={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}
        </VStack>

        <Box flex={1} />
        <VStack spacing="10px" align="center">
          {themeToggle}
          {userMenu}
        </VStack>
      </Box>

      {/* Content */}
      <Box flex={1} minW={0} bg={bgColor}>
        <Outlet />
      </Box>
    </Flex>
  );
};

export default AdminLayout;
