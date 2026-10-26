import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import BookPage from './pages/BookPage';
import History from './pages/History';
import Home from './pages/Home';
import Library from './pages/Library';
import Notes from './pages/Notes';

// pdf.js and epub.js weigh about 1 MB: they only load when the converter or reader opens.
const Converter = lazy(() => import('./pages/Converter'));
const Reader = lazy(() => import('./pages/Reader'));

// HashRouter: the build works from any folder or static server without extra configuration.
export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/biblioteca" element={<Library />} />
            <Route path="/libro/:id" element={<BookPage />} />
            <Route path="/leer/:id" element={<Reader />} />
            <Route path="/convertir" element={<Converter />} />
            <Route path="/historial" element={<History />} />
            <Route path="/notas" element={<Notes />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </HashRouter>
  );
}
