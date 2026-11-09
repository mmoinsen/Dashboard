/**
 * Warn before closing/reloading the tab while a form has unsaved changes.
 * Use inside $effect: `$effect(() => warnOnUnload(() => dirty))`.
 */
export function warnOnUnload(isDirty: () => boolean) {
  const handler = (e: BeforeUnloadEvent) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
