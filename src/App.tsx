import { useEffect } from 'react';
import { createHashRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom';
import { isNative } from './lib/native';
import { useNavDirection } from './components/Nav';
import { ToastProvider } from './components/Toast';
import BookPage from './pages/BookPage';
import History from './pages/History';
import Home from './pages/Home';
import Library from './pages/Library';
import Notes from './pages/Notes';

/**
 * Android's back gesture/button: first closes whatever is open (menu, sheet, selection), then
 * goes back a screen, and on the home screen it minimizes the app instead of closing it.
 */
function useAndroidBack() {
  useEffect(() => {
    if (!isNative) return;
    let remove: (() => void) | undefined;
    void import('@capacitor/app').then(async ({ App: CapApp }) => {
      const handle = await CapApp.addListener('backButton', () => {
        const open = document.querySelector('.popover, .overlay, .click-away');
        if (open) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          return;
        }
        const atHome = !window.location.hash || window.location.hash === '#/' || window.location.hash === '#';
        if (!atHome) {
          document.documentElement.dataset.nav = 'back';
          window.history.length > 1 ? window.history.back() : (window.location.hash = '#/');
          return;
        }
        void CapApp.minimizeApp();
      });
      remove = () => void handle.remove();
    });
    return () => remove?.();
  }, []);
}

function Root() {
  useNavDirection();
  useAndroidBack();
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
