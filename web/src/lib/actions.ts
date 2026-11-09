/**
 * Svelte action: keeps --p (fill percentage) of a range input in sync, used by the CSS.
 * Pass the bound value (`use:rangeFill={value}`) so programmatic changes update it too.
 */
export function rangeFill(node: HTMLInputElement, _value?: unknown) {
  const update = () => {
    const min = Number(node.min || 0);
    const max = Number(node.max || 100);
    const p = max > min ? ((Number(node.value) - min) / (max - min)) * 100 : 0;
    node.style.setProperty('--p', `${Math.min(Math.max(p, 0), 100)}%`);
  };
  update();
  node.addEventListener('input', update);
  return {
    update: () => queueMicrotask(update),
    destroy: () => node.removeEventListener('input', update),
  };
}

/** Pick a fitting icon for an action from its id/label. */
export function actionGlyph(action: string, label = ''): string | undefined {
  const s = `${action} ${label}`.toLowerCase();
  if (/resume|fortsetz|abspiel|play/.test(s)) return 'play';
  if (/pause|anhalten/.test(s)) return 'pause';
  if (/restart|reconnect|neu (start|verbind)|refresh/.test(s)) return 'refresh';
  if (/\bstop|stopp/.test(s)) return 'stop';
  if (/\bstart/.test(s)) return 'play';
  if (/add|request|hinzuf|anfrag|grab|senden/.test(s)) return 'plus';
  if (/search|such/.test(s)) return 'search';
  if (/open|öffnen/.test(s)) return 'external';
  if (/speed|tempo/.test(s)) return 'gauge';
  if (/enable|disable|aktivier|deaktiv|schutz|blockier/.test(s)) return 'power';
  return undefined;
}
