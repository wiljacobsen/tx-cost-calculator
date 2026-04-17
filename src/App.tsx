import { Routes, Route, Navigate } from "react-router-dom";
import { ProjectList } from "./pages/ProjectList";
import { ProjectEditor } from "./pages/ProjectEditor";
import { Compare } from "./pages/Compare";
import { Sensitivity } from "./pages/Sensitivity";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/projects/:id" element={<ProjectEditor />} />
      <Route path="/projects/:id/compare" element={<Compare />} />
      <Route path="/projects/:id/sensitivity" element={<Sensitivity />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
