import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-blun-bg">
      <Sidebar />
      <main className="ml-56">
        <Outlet />
      </main>
    </div>
  );
}
