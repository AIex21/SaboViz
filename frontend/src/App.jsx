import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext'; // <--- IMPORT
import ProjectsPage from './components/Pages/ProjectsPage';
import GraphPage from './components/Pages/GraphPage';

function App() {
  return (
    <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<GraphPage />} />
          </Routes>
        </BrowserRouter>
    </ToastProvider>
  );
}

export default App;