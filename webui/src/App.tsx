import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PreferencesProvider } from './settings/PreferencesContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { isLoggedIn } from './api/auth';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Vehicles = lazy(() => import('./pages/Vehicles').then((m) => ({ default: m.Vehicles })));
const VehicleDetail = lazy(() => import('./pages/VehicleDetail').then((m) => ({ default: m.VehicleDetail })));
const TripDetail = lazy(() => import('./pages/TripDetail').then((m) => ({ default: m.TripDetail })));
const Trips = lazy(() => import('./pages/Trips').then((m) => ({ default: m.Trips })));
const TripDetailById = lazy(() => import('./pages/TripDetailById').then((m) => ({ default: m.TripDetailById })));
const Devices = lazy(() => import('./pages/Devices').then((m) => ({ default: m.Devices })));
const Advanced = lazy(() => import('./pages/Advanced').then((m) => ({ default: m.Advanced })));
const Logs = lazy(() => import('./pages/Logs').then((m) => ({ default: m.Logs })));
const Maintenance = lazy(() => import('./pages/Maintenance').then((m) => ({ default: m.Maintenance })));
const Tracking = lazy(() => import('./pages/Tracking').then((m) => ({ default: m.Tracking })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Help = lazy(() => import('./pages/Help').then((m) => ({ default: m.Help })));

function Protected({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function loadingFallback() {
  return <div className="page"><p className="muted">Loading...</p></div>;
}

function App() {
  return (
    <PreferencesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Suspense fallback={loadingFallback()}><Dashboard /></Suspense>} />
            <Route path="vehicles" element={<Suspense fallback={loadingFallback()}><Vehicles /></Suspense>} />
            <Route path="vehicles/:id" element={<Suspense fallback={loadingFallback()}><VehicleDetail /></Suspense>} />
            <Route path="vehicles/:vehicleId/trip" element={<Suspense fallback={loadingFallback()}><TripDetail /></Suspense>} />
            <Route path="trips" element={<Suspense fallback={loadingFallback()}><Trips /></Suspense>} />
            <Route path="trips/:tripId" element={<Suspense fallback={loadingFallback()}><TripDetailById /></Suspense>} />
            <Route path="devices" element={<Suspense fallback={loadingFallback()}><Devices /></Suspense>} />
            <Route path="advanced" element={<Suspense fallback={loadingFallback()}><Advanced /></Suspense>} />
            <Route path="commands" element={<Navigate to="/advanced" replace />} />
            <Route path="logs" element={<Suspense fallback={loadingFallback()}><Logs /></Suspense>} />
            <Route path="maintenance" element={<Suspense fallback={loadingFallback()}><Maintenance /></Suspense>} />
            <Route path="tracking" element={<Suspense fallback={loadingFallback()}><Tracking /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={loadingFallback()}><Settings /></Suspense>} />
            <Route path="help" element={<Suspense fallback={loadingFallback()}><Help /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PreferencesProvider>
  );
}

export default App;
