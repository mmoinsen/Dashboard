<script lang="ts">
  import { untrack } from 'svelte';
  import { copyText } from '../lib/id.ts';
  import { toast } from '../lib/store.svelte.ts';
  import Glyph from './Glyph.svelte';

  /** Streams Claude's answer for one question; homelab hits are sent along as context. */
  let {
    question,
    hits,
    onback,
  }: { question: string; hits: { title: string; subtitle?: string; group?: string }[]; onback: () => void } = $props();

  let text = $state('');
  let error = $state('');
  let done = $state(false);
  let model = $state('');

  $effect(() => {
    const q = question;
    // hits keep streaming in from the homelab search; they must not restart the question
    const context = untrack(() => $state.snapshot(hits));
    const ctrl = new AbortController();
    text = '';
    error = '';
    done = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ question: q, hits: context }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Fehler ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === 'text') text += ev.text;
            else if (ev.type === 'error') error = ev.message;
            else if (ev.type === 'done') model = ev.model;
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') error = (e as Error).message;
      } finally {
        done = true;
      }
    })();
    return () => ctrl.abort();
  });

  /** Minimal, safe Markdown: escape first, then **bold**, `code`, ```blocks```, "- " lists, paragraphs. */
  function render(md: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const inline = (s: string) =>
      esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const parts = md.split(/```[a-zA-Z0-9-]*\n?/);
    let html = '';
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        html += `<pre><code>${esc(part.replace(/\n$/, ''))}</code></pre>`;
        return;
      }
      for (const block of part.split(/\n{2,}/)) {
        const lines = block.split('\n').filter((l) => l.trim());
        if (!lines.length) continue;
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          html += `<${ordered ? 'ol' : 'ul'}>${lines.map((l) => `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
        } else html += `<p>${lines.map(inline).join('<br>')}</p>`;
      }
    });
    return html;
  }

  async function copy() {
    const ok = await copyText(text);
    toast(ok ? 'Antwort kopiert' : 'Kopieren nicht möglich', ok ? 'ok' : 'bad');
  }
</script>

<section class="ai" aria-label="Antwort von Claude" aria-busy={!done}>
  <div class="head">
    <button class="btn small ghost" onclick={onback}><Glyph name="chevronLeft" size={14} /> Treffer</button>
    <span class="q" title={question}>„{question}“</span>
  </div>

  <div class="answer" aria-live="polite">
    {#if error}
      <div class="banner bad" role="alert">{error}</div>
    {/if}
    {#if text}
      <!-- content is HTML-escaped in render() before the few Markdown tags are added -->
      <div class="md">{@html render(text)}</div>
    {:else if !done}
      <div class="thinking"><span class="spinner"></span> Claude denkt nach…</div>
    {/if}
  </div>

  <footer>
    <span class="muted note">Antwort von Claude{model ? ` (${model})` : ''} · kann Fehler enthalten</span>
    {#if done && text}
      <button class="btn small" onclick={copy}><Glyph name="copy" size={14} /> Kopieren</button>
    {/if}
  </footer>
</section>

<style>
  .ai {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 18px 16px;
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .q {
    font-weight: 600;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .answer {
    min-height: 80px;
  }
  .thinking {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
  }
  .md {
    font-size: 15px;
    line-height: 1.6;
  }
  .md :global(p) {
    margin: 0 0 10px;
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 0 0 10px;
    padding-left: 22px;
  }
  .md :global(li) {
    margin: 3px 0;
  }
  .md :global(code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--surface-2);
    padding: 1px 5px;
    border-radius: 5px;
  }
  .md :global(pre) {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    overflow-x: auto;
  }
  .md :global(pre code) {
    background: none;
    padding: 0;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .note {
    font-size: 12px;
  }
</style>
