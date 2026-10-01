import { lazy, Suspense, useEffect } from 'react';
import { useStore } from './lib/store';
import { useRoute, setCurrency } from './lib/util';
import { Layout } from './components/Layout';
import { ConfirmHost, Toasts, Spinner } from './components/ui';
import { TourHost } from './components/Tour';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PartsPage } from './pages/Parts';
import { MobileUpload } from './pages/MobileUpload';

const Orders = lazy(() => import('./pages/Orders').then((m) => ({ default: m.OrdersPage })));
const OrderPrint = lazy(() => import('./pages/Orders').then((m) => ({ default: m.OrderPrintPage })));
const Pms = lazy(() => import('./pages/Pms').then((m) => ({ default: m.PmsPage })));
const Equipment = lazy(() => import('./pages/Equipment').then((m) => ({ default: m.EquipmentPage })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.AnalyticsPage })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportsPage })));
const Suppliers = lazy(() => import('./pages/Suppliers').then((m) => ({ default: m.SuppliersPage })));
const Labels = lazy(() => import('./pages/Labels').then((m) => ({ default: m.LabelsPage })));
const DataPage = lazy(() => import('./pages/DataPage').then((m) => ({ default: m.DataPage })));
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.ActivityPage })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })));
const Help = lazy(() => import('./pages/Help').then((m) => ({ default: m.HelpPage })));

export function App() {
  const phase = useStore((s) => s.phase);
  const currency = useStore((s) => s.settings.currency);
  const route = useRoute();
  setCurrency(currency);
  useEffect(() => { window.scrollTo(0, 0); }, [route.parts[0]]);

  // Phone photo upload page works without signing in (the QR code carries a one-time code).
  if (route.parts[0] === 'm' && route.parts[1]) return <><MobileUpload code={route.parts[1]} /><Toasts /></>;
  if (phase === 'boot') return <div className="center-screen"><Spinner /></div>;
  if (phase === 'login') return <><Login /><Toasts /></>;

  if (route.parts[0] === 'print' && route.parts[1] === 'order' && route.parts[2]) {
    return <Suspense fallback={<Spinner />}><OrderPrint id={route.parts[2]} /></Suspense>;
  }

  const [a, b] = route.parts;
  let page;
  switch (a) {
    case undefined: page = <Dashboard />; break;
    case 'parts': page = <PartsPage openId={b} query={route.query} />; break;
    case 'orders': page = <Orders id={b} query={route.query} />; break;
    case 'pms': page = <Pms tab={b} query={route.query} />; break;
    case 'knives': page = <Equipment key="knife" type="knife" query={route.query} />; break;
    case 'rollers': page = <Equipment key="roller" type="roller" query={route.query} />; break;
    case 'analytics': page = <Analytics />; break;
    case 'reports': page = <Reports query={route.query} />; break;
    case 'suppliers': page = <Suppliers tab={b} />; break;
    case 'labels': page = <Labels query={route.query} />; break;
    case 'data': page = <DataPage />; break;
    case 'activity': page = <Activity />; break;
    case 'admin': page = <Admin tab={b} />; break;
    case 'profile': page = <Profile />; break;
    case 'help': page = <Help />; break;
    default: page = <Dashboard />;
  }
  return (
    <>
      <Layout path={route.path}>
        <Suspense fallback={<div className="center-screen" style={{ minHeight: '50vh' }}><Spinner /></div>}>{page}</Suspense>
      </Layout>
      <Toasts />
      <ConfirmHost />
      <TourHost />
    </>
  );
}
