import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PreferencesProvider } from './settings/PreferencesContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Vehicles } from './pages/Vehicles';
import { VehicleDetail } from './pages/VehicleDetail';
import { Devices } from './pages/Devices';
import { Maintenance } from './pages/Maintenance';
import { Tracking } from './pages/Tracking';
import { TripDetail } from './pages/TripDetail';
import { TripDetailById } from './pages/TripDetailById';
import { Trips } from './pages/Trips';
import { Settings } from './pages/Settings';
import { Help } from './pages/Help';
import { Login } from './pages/Login';
import { isLoggedIn } from './api/auth';

function Protected({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
            <Route index element={<Dashboard />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="vehicles/:id" element={<VehicleDetail />} />
            <Route path="vehicles/:vehicleId/trip" element={<TripDetail />} />
            <Route path="trips" element={<Trips />} />
            <Route path="trips/:tripId" element={<TripDetailById />} />
            <Route path="devices" element={<Devices />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="tracking" element={<Tracking />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PreferencesProvider>
  );
}

export default App;
