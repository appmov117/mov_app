import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { Loading } from "./components/ui/loading.tsx";
import { useAuth } from "./lib/auth.tsx";
import type { Role } from "./lib/api.ts";
import { Landing } from "./pages/Landing.tsx";

const Login = lazy(() => import("./pages/Login.tsx").then((module) => ({ default: module.Login })));
const ReferralLanding = lazy(() => import("./pages/Referral.tsx").then((module) => ({ default: module.ReferralLanding })));
const PrivacyPolicy = lazy(() => import("./pages/Legal.tsx").then((module) => ({ default: module.PrivacyPolicy })));
const Terms = lazy(() => import("./pages/Legal.tsx").then((module) => ({ default: module.Terms })));
const Register = lazy(() => import("./pages/Register.tsx").then((module) => ({ default: module.Register })));
const AdminHome = lazy(() => import("./pages/admin/Admin.tsx").then((module) => ({ default: module.AdminHome })));
const DriverHome = lazy(() => import("./pages/driver/Home.tsx").then((module) => ({ default: module.DriverHome })));
const MembershipPage = lazy(() => import("./pages/driver/Membership.tsx").then((module) => ({ default: module.MembershipPage })));
const DriverDemand = lazy(() => import("./pages/driver/Demand.tsx").then((module) => ({ default: module.DriverDemand })));
const DriverPayout = lazy(() => import("./pages/driver/Payout.tsx").then((module) => ({ default: module.DriverPayout })));
const DriverWorkZone = lazy(() => import("./pages/driver/WorkZone.tsx").then((module) => ({ default: module.DriverWorkZone })));
const DriverDocuments = lazy(() => import("./pages/driver/Documents.tsx").then((module) => ({ default: module.DriverDocuments })));
const DriverProfile = lazy(() => import("./pages/driver/Profile.tsx").then((module) => ({ default: module.DriverProfile })));
const DriverReferral = lazy(() => import("./pages/driver/Referral.tsx").then((module) => ({ default: module.DriverReferral })));
const DriverRide = lazy(() => import("./pages/driver/Ride.tsx").then((module) => ({ default: module.DriverRide })));
const DriverStats = lazy(() => import("./pages/driver/Stats.tsx").then((module) => ({ default: module.DriverStats })));
const DriverTrips = lazy(() => import("./pages/driver/Trips.tsx").then((module) => ({ default: module.DriverTrips })));
const PassengerHistory = lazy(() => import("./pages/passenger/History.tsx").then((module) => ({ default: module.PassengerHistory })));
const PassengerHome = lazy(() => import("./pages/passenger/Home.tsx").then((module) => ({ default: module.PassengerHome })));
const PassengerMessages = lazy(() => import("./pages/passenger/Messages.tsx").then((module) => ({ default: module.PassengerMessages })));
const PassengerProfile = lazy(() => import("./pages/passenger/Profile.tsx").then((module) => ({ default: module.PassengerProfile })));
const PassengerRide = lazy(() => import("./pages/passenger/Ride.tsx").then((module) => ({ default: module.PassengerRide })));
const TripDetail = lazy(() => import("./pages/TripDetail.tsx").then((module) => ({ default: module.TripDetail })));

function Gate({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-dvh"><Loading /></div>;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh"><Loading /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/entrar" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/r/:code" element={<ReferralLanding />} />
        <Route path="/privacidad" element={<PrivacyPolicy />} />
        <Route path="/terminos" element={<Terms />} />
        <Route path="/pasajero" element={<Gate role="passenger"><PassengerHome /></Gate>} />
        <Route path="/pasajero/viaje" element={<Gate role="passenger"><PassengerRide /></Gate>} />
        <Route path="/pasajero/historial" element={<Gate role="passenger"><PassengerHistory /></Gate>} />
        <Route path="/pasajero/historial/:id" element={<Gate role="passenger"><TripDetail role="passenger" /></Gate>} />
        <Route path="/pasajero/mensajes" element={<Gate role="passenger"><PassengerMessages /></Gate>} />
        <Route path="/pasajero/perfil" element={<Gate role="passenger"><PassengerProfile /></Gate>} />
        <Route path="/conductor" element={<Gate role="driver"><DriverHome /></Gate>} />
        <Route path="/conductor/viaje" element={<Gate role="driver"><DriverRide /></Gate>} />
        <Route path="/conductor/membresia" element={<Gate role="driver"><MembershipPage /></Gate>} />
        <Route path="/conductor/estadisticas" element={<Gate role="driver"><DriverStats /></Gate>} />
        <Route path="/conductor/ganancias" element={<Gate role="driver"><DriverStats /></Gate>} />
        <Route path="/conductor/viajes" element={<Gate role="driver"><DriverTrips /></Gate>} />
        <Route path="/conductor/viajes/:id" element={<Gate role="driver"><TripDetail role="driver" /></Gate>} />
        <Route path="/conductor/demanda" element={<Gate role="driver"><DriverDemand /></Gate>} />
        <Route path="/conductor/zona" element={<Gate role="driver"><DriverWorkZone /></Gate>} />
        <Route path="/conductor/pagos" element={<Gate role="driver"><DriverPayout /></Gate>} />
        <Route path="/conductor/documentos" element={<Gate role="driver"><DriverDocuments /></Gate>} />
        <Route path="/conductor/perfil" element={<Gate role="driver"><DriverProfile /></Gate>} />
        <Route path="/conductor/referidos" element={<Gate role="driver"><DriverReferral /></Gate>} />
        <Route path="/admin/:section?" element={<Gate role="admin"><AdminHome /></Gate>} />
      </Routes>
    </Suspense>
  );
}
