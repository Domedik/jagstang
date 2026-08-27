import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import theme from './theme';
import { renderAppToast } from './components/AppToast';

// Pages
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyMagicLink from './pages/VerifyMagicLink';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import PatientList from './pages/PatientList';
import PatientDetail from './pages/PatientDetail';
import PatientForm from './pages/PatientForm';
import CalendarPage from './pages/Calendar';
import NoteForm from './pages/NoteForm';
import FormNoteForm from './pages/FormNoteForm';
import DoctorProfile from './pages/DoctorProfile';
import Library from './pages/Library';
import DocumentsList from './pages/library/DocumentsList';
import FormsList from './pages/library/FormsList';
import FormEditor from './pages/library/FormEditor';
import NotesList from './pages/library/NotesList';
import NoteBuilderPage from './pages/library/NoteBuilderPage';
import Compliance from './pages/Compliance';
import ContactList from './pages/ContactList';
import ContactForm from './pages/ContactForm';
import Team from './pages/Team';
import TemplateFillForm from './pages/TemplateFillForm';

// Admin panel (ADMIN role only)
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminInvoices from './pages/admin/AdminInvoices';
import AdminAuditLog from './pages/admin/AdminAuditLog';
import AdminCompliance from './pages/admin/AdminCompliance';

// Components
import Layout from './components/Layout';
import AuthLoadingScreen from './components/AuthLoadingScreen';
import BetaPausedOverlay from './components/BetaPausedOverlay';
import {
  HOME_NAV_ENABLED,
  PATIENTS_NAV_ENABLED,
  CALENDAR_NAV_ENABLED,
  TEAM_NAV_ENABLED,
  CONTACTS_NAV_ENABLED,
  LIBRARY_NAV_ENABLED,
  COMPLIANCE_NAV_ENABLED,
  ADMIN_INVOICES_NAV_ENABLED,
  ADMIN_COMPLIANCE_NAV_ENABLED,
} from './config/features';

/**
 * Landing spot for anything whose feature flag is off (disabled routes,
 * the `*` catch-all): the first enabled nav destination, in the same
 * priority order as the sidebar. `/profile` is the last resort since it
 * isn't flag-gated (reachable from the avatar menu regardless).
 */
const DEFAULT_ROUTE = HOME_NAV_ENABLED
  ? '/'
  : PATIENTS_NAV_ENABLED
    ? '/patients'
    : CALENDAR_NAV_ENABLED
      ? '/calendar'
      : TEAM_NAV_ENABLED
        ? '/team'
        : CONTACTS_NAV_ENABLED
          ? '/contacts'
          : LIBRARY_NAV_ENABLED
            ? '/library'
            : COMPLIANCE_NAV_ENABLED
              ? '/compliance'
              : '/profile';

/** Rol de miembro de equipo (token `cognito:groups`): acceso reducido. */
type TeamMemberRole = 'NURSE' | 'ASSISTANT';

/** Landing por rol de miembro: lo único que sus grants permiten operar. */
const MEMBER_HOME: Record<TeamMemberRole, string> = {
  NURSE: '/patients',
  ASSISTANT: '/calendar',
};

// Protected Route Component. `members` lista los roles de equipo que pueden
// entrar a la ruta; nurses/assistants fuera de esa lista van a su landing.
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  members?: TeamMemberRole[];
}> = ({ children, members = [] }) => {
  const { isAuthenticated, isLoading, isAdmin, doctor } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // ADMIN-role users only see the admin panel, never the regular doctor frontend.
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const role = (doctor?.role ?? '').toUpperCase();
  if (
    (role === 'NURSE' || role === 'ASSISTANT') &&
    !members.includes(role as TeamMemberRole)
  ) {
    return <Navigate to={MEMBER_HOME[role as TeamMemberRole]} replace />;
  }

  return <>{children}</>;
};

// Admin Route Component — only users whose token carries "cognito:groups": ["ADMIN"].
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to={DEFAULT_ROUTE} replace />;
  }

  return <>{children}</>;
};

// Public Route Component
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin' : '/'} replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/landing" element={<LandingPage />} />
      {/* Login must always be reachable — even with a stale/invalid cached
          session — so it's the one auth page not gated by PublicRoute. */}
      <Route path="/login" element={<Login />} />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/verify"
        element={
          <PublicRoute>
            <VerifyMagicLink />
          </PublicRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          HOME_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/patients"
        element={
          PATIENTS_NAV_ENABLED ? (
            <ProtectedRoute members={['NURSE']}>
              <Layout>
                <PatientList />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/patients/new"
        element={
          PATIENTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <PatientForm />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/patients/:patientSlug"
        element={
          PATIENTS_NAV_ENABLED ? (
            <ProtectedRoute members={['NURSE']}>
              <Layout>
                <PatientDetail />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/patients/:patientSlug/notes/new"
        element={
          PATIENTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <NoteForm />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/patients/:patientSlug/notes/:noteId/edit"
        element={
          PATIENTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <NoteForm />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/patients/:patientSlug/notes/new-form"
        element={
          PATIENTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <FormNoteForm />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/patients/:patientSlug/notes/:noteId/edit-form"
        element={
          PATIENTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <FormNoteForm />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/calendar"
        element={
          CALENDAR_NAV_ENABLED ? (
            <ProtectedRoute members={['ASSISTANT']}>
              <Layout>
                <CalendarPage />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/compliance"
        element={
          COMPLIANCE_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <Compliance />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute members={['NURSE', 'ASSISTANT']}>
            <Layout>
              <DoctorProfile />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/library"
        element={
          LIBRARY_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <Library />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      >
        <Route index element={<Navigate to="/library/documents" replace />} />
        <Route path="documents" element={<DocumentsList />} />
        <Route
          path="templates"
          element={<Navigate to="/library/documents" replace />}
        />
        <Route path="forms" element={<FormsList />} />
        <Route path="notes" element={<NotesList />} />
      </Route>
      <Route
        path="/library/templates/new"
        element={
          LIBRARY_NAV_ENABLED ? (
            <Navigate to="/library/documents" replace />
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/library/templates/:id"
        element={
          LIBRARY_NAV_ENABLED ? (
            <Navigate to="/library/documents" replace />
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/library/forms/new"
        element={
          LIBRARY_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <FormEditor />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/library/forms/:id"
        element={
          LIBRARY_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <FormEditor />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/library/notes/new"
        element={
          LIBRARY_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <NoteBuilderPage />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/library/notes/:id"
        element={
          LIBRARY_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <NoteBuilderPage />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/formularios"
        element={
          LIBRARY_NAV_ENABLED ? (
            <Navigate to="/library/forms" replace />
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/templates/fill"
        element={
          <ProtectedRoute>
            <Layout>
              <TemplateFillForm />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute members={['NURSE', 'ASSISTANT']}>
            <Layout>
              <Team />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          CONTACTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <ContactList />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/contacts/new"
        element={
          CONTACTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <ContactForm />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />
      <Route
        path="/contacts/:id/edit"
        element={
          CONTACTS_NAV_ENABLED ? (
            <ProtectedRoute>
              <Layout>
                <ContactForm />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Navigate to={DEFAULT_ROUTE} replace />
          )
        }
      />

      {/* Admin panel — only reachable with an ADMIN cognito group claim */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="usuarios" element={<AdminUsers />} />
        <Route
          path="facturas"
          element={
            ADMIN_INVOICES_NAV_ENABLED ? (
              <AdminInvoices />
            ) : (
              <Navigate to="/admin/dashboard" replace />
            )
          }
        />
        <Route path="audit-log" element={<AdminAuditLog />} />
        <Route
          path="compliance"
          element={
            ADMIN_COMPLIANCE_NAV_ENABLED ? (
              <AdminCompliance />
            ) : (
              <Navigate to="/admin/dashboard" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
    </Routes>
  );
};

/** Matches Chakra theme `md` (48em): compact viewports get top-right toasts. */
const MD_UP_MEDIA = '(min-width: 48em)';

const ChakraAppShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toastPosition, setToastPosition] = useState<
    'top-right' | 'bottom-right'
  >(() => {
    if (typeof window === 'undefined') return 'bottom-right';
    return window.matchMedia(MD_UP_MEDIA).matches
      ? 'bottom-right'
      : 'top-right';
  });

  useEffect(() => {
    const mq = window.matchMedia(MD_UP_MEDIA);
    const sync = () =>
      setToastPosition(mq.matches ? 'bottom-right' : 'top-right');
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <ChakraProvider
      theme={theme}
      toastOptions={{
        defaultOptions: {
          position: toastPosition,
          duration: 4000,
          isClosable: true,
          render: renderAppToast,
        },
      }}
    >
      {children}
    </ChakraProvider>
  );
};

const App: React.FC = () => {
  return (
    <>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraAppShell>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <BetaPausedOverlay />
        </AuthProvider>
      </ChakraAppShell>
    </>
  );
};

export default App;
