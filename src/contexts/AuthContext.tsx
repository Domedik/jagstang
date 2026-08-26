import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Doctor, LoginCredentials } from '../types';
import { apiService } from '../services/api';
import { warmClinicData, clearClinicData } from '../lib/clinicDataStore';
import { getErrorMessage } from '../utils/apiStatus';

/** Decode X-Clineo-Identity token (JWT payload or JSON) to get name, family_name, gender, avatar_url */
function decodeIdentityToken(idToken: string | null): {
  name?: string;
  family_name?: string;
  gender?: 'male' | 'female';
  avatar_url?: string;
  role?: string;
} | null {
  if (!idToken || typeof idToken !== 'string') return null;

  const getRoleFromParsed = (
    parsed: Record<string, unknown>
  ): string | undefined => {
    const groups = parsed['cognito:groups'];
    if (
      Array.isArray(groups) &&
      groups.length > 0 &&
      typeof groups[0] === 'string' &&
      groups[0].trim().length > 0
    ) {
      return groups[0];
    }
    return typeof parsed.role === 'string' ? parsed.role : undefined;
  };

  try {
    // Try as plain JSON first
    const parsed = JSON.parse(idToken) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        family_name:
          typeof parsed.family_name === 'string'
            ? parsed.family_name
            : undefined,
        gender:
          parsed.gender === 'male' || parsed.gender === 'female'
            ? parsed.gender
            : undefined,
        avatar_url:
          typeof parsed.avatar_url === 'string' ? parsed.avatar_url : undefined,
        role: getRoleFromParsed(parsed),
      };
    }
  } catch {
    // Not JSON, try JWT payload (middle part)
  }
  try {
    const parts = idToken.split('.');
    if (parts.length >= 2) {
      const payload = parts[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '==='.slice(0, (4 - (base64.length % 4)) % 4);
      const decoded = atob(padded);
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      return {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        family_name:
          typeof parsed.family_name === 'string'
            ? parsed.family_name
            : undefined,
        gender:
          parsed.gender === 'male' || parsed.gender === 'female'
            ? parsed.gender
            : undefined,
        avatar_url:
          typeof parsed.avatar_url === 'string' ? parsed.avatar_url : undefined,
        role: getRoleFromParsed(parsed),
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

/** Prefer the published landing photo over the identity avatar when present. */
async function loadLandingAvatar(
  current: Doctor,
  persist: (next: Doctor) => void
) {
  try {
    const landing = await apiService.getDoctorLanding();
    if (landing.photo_url) {
      persist({ ...current, avatar: landing.photo_url });
    }
  } catch {
    // No landing or network error — keep identity / stored avatar.
  }
}

interface AuthContextType {
  doctor: Doctor | null;
  isAuthenticated: boolean;
  /** True when the identity token's `cognito:groups` (or `role`) is "ADMIN". */
  isAdmin: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithMagicLink: (token: string) => Promise<void>;
  logout: () => void;
  /** Merge fields into the in-memory/localStorage doctor (e.g. landing photo). */
  updateDoctor: (patch: Partial<Doctor>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const persistDoctor = (next: Doctor) => {
    setDoctor(next);
    localStorage.setItem('doctor', JSON.stringify(next));
  };

  const updateDoctor = (patch: Partial<Doctor>) => {
    setDoctor((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      localStorage.setItem('doctor', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const storedDoctor = localStorage.getItem('doctor');
    const storedToken = localStorage.getItem('token');
    const idToken = localStorage.getItem('id_token');
    const identity = decodeIdentityToken(idToken);

    let restored: Doctor | null = null;
    if (storedDoctor && storedToken) {
      const doctorData = JSON.parse(storedDoctor) as Doctor;
      if (
        identity?.name !== undefined ||
        identity?.family_name !== undefined ||
        identity?.gender !== undefined ||
        identity?.avatar_url !== undefined ||
        identity?.role !== undefined
      ) {
        restored = {
          ...doctorData,
          firstName: identity.name ?? doctorData.firstName,
          lastName: identity.family_name ?? doctorData.lastName,
          gender: identity.gender ?? doctorData.gender,
          avatar: identity.avatar_url ?? doctorData.avatar,
          role: identity.role ?? doctorData.role,
        };
      } else {
        restored = doctorData;
      }
      setDoctor(restored);
    }
    setIsLoading(false);
    if (storedToken && (identity?.role ?? '').toUpperCase() !== 'ADMIN') {
      warmClinicData();
      if (restored) {
        void loadLandingAvatar(restored, persistDoctor);
      }
    }
  }, []);

  const applyCredentials = (
    response: { access: string; refresh: string; id: string },
    emailGuess: string
  ) => {
    localStorage.setItem('token', response.access);
    localStorage.setItem('refresh_token', response.refresh);
    const idTokenValue =
      typeof response.id === 'string'
        ? response.id
        : JSON.stringify(response.id);
    localStorage.setItem('id_token', idTokenValue);

    const identity = decodeIdentityToken(idTokenValue);
    const doctorId = typeof response.id === 'string' ? response.id : emailGuess;
    const doctorData: Doctor = {
      id: doctorId,
      firstName: identity?.name ?? '',
      lastName: identity?.family_name ?? '',
      email: emailGuess,
      role: identity?.role,
      gender: identity?.gender,
      avatar: identity?.avatar_url,
      speciality: '',
      licenseNumber: '',
      phone: '',
    };
    persistDoctor(doctorData);
    if ((identity?.role ?? '').toUpperCase() !== 'ADMIN') {
      warmClinicData();
      void loadLandingAvatar(doctorData, persistDoctor);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const response = await apiService.login({
        username: credentials.email,
        password: credentials.password,
        method: 'email',
      });
      applyCredentials(response, credentials.email);
    } catch (error: unknown) {
      if (getErrorMessage(error, '')) {
        throw error;
      }
      throw new Error('Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithMagicLink = async (token: string) => {
    setIsLoading(true);
    try {
      const response = await apiService.verifyMagicLink(token);
      applyCredentials(response, '');
    } catch (error: unknown) {
      if (getErrorMessage(error, '')) {
        throw error;
      }
      throw new Error('Enlace inválido o expirado');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    clearClinicData();
    setDoctor(null);
    localStorage.removeItem('doctor');
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('id_token');
  };

  const isAdmin = !!doctor && (doctor.role ?? '').toUpperCase() === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        doctor,
        isAuthenticated: !!doctor,
        isAdmin,
        login,
        loginWithMagicLink,
        logout,
        updateDoctor,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
