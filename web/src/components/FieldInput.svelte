<script lang="ts">
  import type { FieldDef } from '../lib/types.ts';

  /** Renders a form control for an integration-defined field. */
  let { field, value = $bindable(), secretSet = false }: { field: FieldDef; value: any; secretSet?: boolean } = $props();
  const id = `f-${Math.random().toString(36).slice(2, 9)}`;
</script>

{#if field.type === 'boolean'}
  <label class="check">
    <input type="checkbox" checked={value ?? field.default ?? false} onchange={(e) => (value = e.currentTarget.checked)} />
    <span>{field.label}</span>
  </label>
  {#if field.help}<small class="muted">{field.help}</small>{/if}
{:else}
  <label class="field" for={id}>
    <span>{field.label}{field.required ? ' *' : ''}</span>
    {#if field.type === 'select'}
      <select {id} class="input" value={value ?? field.default ?? ''} onchange={(e) => (value = e.currentTarget.value)}>
        {#each field.options ?? [] as o}
          <option value={o.value}>{o.label}</option>
        {/each}
      </select>
    {:else if field.type === 'text'}
      <textarea {id} class="input" placeholder={field.placeholder ?? ''} bind:value></textarea>
    {:else if field.type === 'secret'}
      <input {id} class="input" type="password" autocomplete="new-password" placeholder={secretSet ? '•••••••• (gespeichert – leer lassen zum Behalten)' : (field.placeholder ?? '')} bind:value />
    {:else if field.type === 'number'}
      <input {id} class="input" type="number" step="any" placeholder={field.placeholder ?? (field.default != null ? String(field.default) : '')} bind:value />
    {:else}
      <input {id} class="input" type={field.type === 'url' ? 'url' : 'text'} placeholder={field.placeholder ?? (field.default != null ? String(field.default) : '')} bind:value />
    {/if}
    {#if field.help}<small>{field.help}</small>{/if}
  </label>
{/if}
