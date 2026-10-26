/* eslint-disable react-refresh/only-export-components */
import { forwardRef, useCallback, useEffect } from 'react';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useNavigate as useRouterNavigate,
  type LinkProps,
  type NavigateOptions,
  type NavLinkProps,
  type To,
} from 'react-router-dom';

// Everything from React Router, except Link, NavLink and useNavigate, which animate the change.
export * from 'react-router-dom';

type Direction = 'forward' | 'back' | 'tab';

const setDirection = (dir: Direction) => {
  document.documentElement.dataset.nav = dir;
};

/** Every navigation goes through the View Transitions API (the CSS decides how it moves). */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  return <RouterLink ref={ref} viewTransition {...props} />;
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(props, ref) {
  return <RouterNavLink ref={ref} viewTransition {...props} />;
});

export function useNavigate() {
  const navigate = useRouterNavigate();
  return useCallback(
    (to: To, options?: NavigateOptions & { direction?: Direction }) => {
      setDirection(options?.direction ?? 'forward');
      return navigate(to, { viewTransition: true, ...options });
    },
    [navigate],
  );
}

/**
 * Decides the direction before each change: a link marked data-nav="back" slides back, tabs and
 * panel links cross-fade, the browser's back button counts as going back and everything else
 * moves forward.
 */
export function useNavDirection() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a) return;
      setDirection((a.dataset.nav as Direction | undefined) ?? 'forward');
    };
    const onPop = () => setDirection('back');
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
}
