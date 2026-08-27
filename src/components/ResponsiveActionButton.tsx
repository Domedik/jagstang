import React from 'react';
import {
  Button,
  Icon,
  IconButton,
  Tooltip,
  useBreakpointValue,
} from '@chakra-ui/react';

interface ResponsiveActionButtonProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: string;
  size?: string;
  h?: string;
  borderColor?: string;
  color?: string;
  bg?: string;
  _hover?: Record<string, unknown>;
}

/**
 * Acción secundaria: icono con tooltip en móvil, botón con etiqueta en
 * escritorio. Reduce duplicación en headers densos (p. ej. expediente).
 */
const ResponsiveActionButton: React.FC<ResponsiveActionButtonProps> = ({
  icon,
  label,
  onClick,
  href,
  variant = 'outline',
  size = 'sm',
  h = '36px',
  borderColor = 'line.strong',
  color = 'text.strong',
  bg,
  _hover = { borderColor: 'paper.600' },
}) => {
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;

  if (isMobile) {
    return (
      <Tooltip label={label} hasArrow placement="bottom">
        <IconButton
          as={href ? 'a' : undefined}
          href={href}
          aria-label={label}
          icon={<Icon as={icon} />}
          variant={variant}
          size={size}
          h={h}
          borderColor={borderColor}
          color={color}
          bg={bg}
          onClick={onClick}
          _hover={_hover}
        />
      </Tooltip>
    );
  }

  return (
    <Button
      as={href ? 'a' : undefined}
      href={href}
      leftIcon={<Icon as={icon} />}
      variant={variant}
      size={size}
      h={h}
      borderColor={borderColor}
      color={color}
      bg={bg}
      onClick={onClick}
      _hover={_hover}
    >
      {label}
    </Button>
  );
};

export default ResponsiveActionButton;
