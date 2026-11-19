export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Listen for reduced-motion changes; returns an unsubscribe function. */
export const watchReducedMotion = (listener: (reduced: boolean) => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = (event: MediaQueryListEvent): void => listener(event.matches);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
