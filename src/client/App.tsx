import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { InspectionPage } from './pages/InspectionPage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { VehiclesPage } from './pages/VehiclesPage.tsx';
import { WorkshopControls } from './workshop/WorkshopControls.tsx';

export function App() {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-title">
          <h1>Inspection Desk</h1>
          <span className="shell-note">Fictional training data</span>
        </div>
        <nav aria-label="Main">
          <NavLink to="/vehicles">Vehicles</NavLink>
          <NavLink to="/reports">Reports</NavLink>
        </nav>
      </header>
      <div className="shell-body">
        <main className="shell-main">
          <Routes>
            <Route path="/" element={<Navigate to="/vehicles" replace />} />
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/inspections/:inspectionId" element={<InspectionPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/:runId" element={<ReportPage />} />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </main>
        <aside className="shell-aside">
          <WorkshopControls />
        </aside>
      </div>
    </div>
  );
}
