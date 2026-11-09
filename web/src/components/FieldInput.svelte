<script lang="ts">
  import type { FieldDef } from '../lib/types.ts';

  /** Renders a form control for an integration-defined field. */
  let { field, value = $bindable(), secretSet = false }: { field: FieldDef; value: any; secretSet?: boolean } = $props();
  const id = `f-${Math.random().toString(36).slice(2, 9)}`;
  const helpId = `${id}-help`;

  /** Placeholders show an example and end with "…". */
  const placeholder = $derived.by(() => {
    if (field.type === 'secret' && secretSet) return '•••••••• (gespeichert – leer lassen zum Behalten)';
    const example = field.placeholder ?? (field.default != null && field.default !== '' ? String(field.default) : '');
    if (!example) return '';
    return example.endsWith('…') ? example : `${example}…`;
  });

  const range = $derived(
    field.min != null && field.max != null ? `${field.min} bis ${field.max}` : field.min != null ? `mindestens ${field.min}` : field.max != null ? `höchstens ${field.max}` : '',
  );
  const describedBy = $derived(field.help || range ? helpId : undefined);

  function clamp() {
    // keep the value inside the allowed range (e.g. no negative counts)
    if (value === '' || value == null) return;
    let n = Number(value);
    if (!Number.isFinite(n)) {
      value = '';
      return;
    }
    if (field.min != null) n = Math.max(n, field.min);
    if (field.max != null) n = Math.min(n, field.max);
    value = n;
  }
</script>

{#if field.type === 'boolean'}
  <label class="check">
    <input type="checkbox" name={field.key} checked={value ?? field.default ?? false} onchange={(e) => (value = e.currentTarget.checked)} aria-describedby={describedBy} />
    <span>{field.label}</span>
  </label>
  {#if field.help}<small class="muted" id={helpId}>{field.help}</small>{/if}
{:else}
  <label class="field" for={id}>
    <span>{field.label}{#if field.required}<span aria-hidden="true"> *</span><span class="sr-only"> (Pflichtfeld)</span>{/if}</span>
    {#if field.type === 'select'}
      <select {id} name={field.key} class="input" value={value ?? field.default ?? ''} onchange={(e) => (value = e.currentTarget.value)} aria-describedby={describedBy}>
        {#each field.options ?? [] as o}
          <option value={o.value}>{o.label}</option>
        {/each}
      </select>
    {:else if field.type === 'text'}
      <textarea {id} name={field.key} class="input" {placeholder} required={field.required} autocomplete="off" spellcheck="false" aria-describedby={describedBy} bind:value></textarea>
    {:else if field.type === 'secret'}
      <!-- API keys are not account passwords: keep password managers out of it -->
      <input
        {id}
        name={field.key}
        class="input mono-input"
        type="password"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        spellcheck="false"
        autocapitalize="none"
        {placeholder}
        aria-describedby={describedBy}
        bind:value
      />
    {:else if field.type === 'number'}
      <input
        {id}
        name={field.key}
        class="input"
        type="number"
        inputmode="decimal"
        step="any"
        min={field.min}
        max={field.max}
        autocomplete="off"
        required={field.required}
        {placeholder}
        aria-describedby={describedBy}
        bind:value
        onchange={clamp}
      />
    {:else}
      <input
        {id}
        name={field.key}
        class="input"
        type={field.type === 'url' ? 'url' : 'text'}
        inputmode={field.type === 'url' ? 'url' : undefined}
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        required={field.required}
        {placeholder}
        aria-describedby={describedBy}
        bind:value
      />
    {/if}
    {#if field.help || range}
      <small id={helpId}>{field.help ?? ''}{field.help && range ? ' · ' : ''}{range}</small>
    {/if}
  </label>
{/if}
