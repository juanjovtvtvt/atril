import { createHashRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom';
import { useNavDirection } from './components/Nav';
import { ToastProvider } from './components/Toast';
import BookPage from './pages/BookPage';
import History from './pages/History';
import Home from './pages/Home';
import Library from './pages/Library';
import Notes from './pages/Notes';

function Root() {
  useNavDirection();
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/*
 * Data router: required for the View Transitions on every navigation. The converter and the
 * reader (pdf.js and epub.js, about 1 MB) load on demand; the router waits for them before
 * animating, so the new screen never enters empty.
 */
const router = createHashRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/biblioteca', element: <Library /> },
      { path: '/libro/:id', element: <BookPage /> },
      { path: '/leer/:id', lazy: async () => ({ Component: (await import('./pages/Reader')).default }) },
      { path: '/convertir', lazy: async () => ({ Component: (await import('./pages/Converter')).default }) },
      { path: '/historial', element: <History /> },
      { path: '/notas', element: <Notes /> },
      { path: '*', element: <Home /> },
    ],
  },
]);

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
