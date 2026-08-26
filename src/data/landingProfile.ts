import type { IconType } from 'react-icons';
import {
  LuBaby,
  LuBone,
  LuBrain,
  LuEye,
  LuGlobe,
  LuHeart,
  LuLeaf,
  LuLightbulb,
  LuSmile,
  LuStethoscope,
} from 'react-icons/lu';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaTiktok,
  FaXTwitter,
} from 'react-icons/fa6';

export type SpecialtyIconKey =
  | 'stethoscope'
  | 'heart'
  | 'brain'
  | 'baby'
  | 'eye'
  | 'bone'
  | 'tooth'
  | 'skin'
  | 'mind'
  | 'nutrition';

export const SPECIALTY_ICON_OPTIONS: {
  key: SpecialtyIconKey;
  label: string;
  Icon: IconType;
}[] = [
  { key: 'stethoscope', label: 'General', Icon: LuStethoscope },
  { key: 'heart', label: 'Cardiología', Icon: LuHeart },
  { key: 'brain', label: 'Neurología', Icon: LuBrain },
  { key: 'baby', label: 'Pediatría', Icon: LuBaby },
  { key: 'eye', label: 'Oftalmología', Icon: LuEye },
  { key: 'bone', label: 'Ortopedia', Icon: LuBone },
  { key: 'tooth', label: 'Odontología', Icon: LuSmile },
  { key: 'skin', label: 'Dermatología', Icon: LuLeaf },
  { key: 'mind', label: 'Psiquiatría', Icon: LuLightbulb },
  { key: 'nutrition', label: 'Nutrición', Icon: LuGlobe },
];

export type SocialLinkKey =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'tiktok'
  | 'website';

export type ApiSocialLinks = Partial<Record<SocialLinkKey, string>>;

export const SOCIAL_LINK_FIELDS: {
  key: SocialLinkKey;
  label: string;
  placeholder: string;
  Icon: IconType;
}[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/tu-usuario',
    Icon: FaInstagram,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    placeholder: 'https://facebook.com/tu-pagina',
    Icon: FaFacebook,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    placeholder: 'https://linkedin.com/in/tu-perfil',
    Icon: FaLinkedin,
  },
  {
    key: 'x',
    label: 'X',
    placeholder: 'https://x.com/tu-usuario',
    Icon: FaXTwitter,
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    placeholder: 'https://tiktok.com/@tu-usuario',
    Icon: FaTiktok,
  },
  {
    key: 'website',
    label: 'Sitio web',
    placeholder: 'https://tu-sitio.com',
    Icon: LuGlobe,
  },
];

export const emptySocialLinks = (): Record<SocialLinkKey, string> => ({
  instagram: '',
  facebook: '',
  linkedin: '',
  x: '',
  tiktok: '',
  website: '',
});

export function socialLinksFromApi(
  links?: ApiSocialLinks | null
): Record<SocialLinkKey, string> {
  const base = emptySocialLinks();
  if (!links) return base;
  for (const field of SOCIAL_LINK_FIELDS) {
    base[field.key] = links[field.key]?.trim() ?? '';
  }
  return base;
}

export function socialLinksToApi(
  links: Record<SocialLinkKey, string>
): ApiSocialLinks {
  const payload: ApiSocialLinks = {};
  for (const field of SOCIAL_LINK_FIELDS) {
    const value = links[field.key].trim();
    if (value) payload[field.key] = value;
  }
  return payload;
}
