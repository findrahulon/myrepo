import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { UploadPage } from './pages/UploadPage'
import { AnalysisPage } from './pages/AnalysisPage'
import { OverlapPage } from './pages/OverlapPage'
import { RoadmapPage } from './pages/RoadmapPage'
import { WorkbookDetailsPage } from './pages/WorkbookDetailsPage'
import { ArchitecturePage } from './pages/ArchitecturePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/upload" replace />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="overlap" element={<OverlapPage />} />
          <Route path="roadmap" element={<RoadmapPage />} />
          <Route path="workbook/:id" element={<WorkbookDetailsPage />} />
          <Route path="architecture" element={<ArchitecturePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
