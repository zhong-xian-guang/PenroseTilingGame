<script lang="ts">
  import type { TileKind } from '../engine';
  import { t } from '../i18n/index.svelte';

  interface Props {
    kinds: readonly TileKind[];
    selected: TileKind | null;
    colors: Record<TileKind, string>;
    /** Outline polygon of each kind, in a 0–1 box (for the button icon). */
    icons: Record<TileKind, string>;
    labels: Record<TileKind, string>;
    onselect: (kind: TileKind | null) => void;
  }

  let { kinds, selected, colors, icons, labels, onselect }: Props = $props();
</script>

<div class="tray" role="toolbar" aria-label={t('tray.label')}>
  {#each kinds as kind (kind)}
    <button
      type="button"
      class:selected={selected === kind}
      aria-pressed={selected === kind}
      onclick={() => onselect(selected === kind ? null : kind)}
    >
      <svg viewBox="-0.1 -0.1 1.2 1.2" aria-hidden="true">
        <polygon points={icons[kind]} fill={colors[kind]} stroke="currentColor" stroke-width="0.04" />
      </svg>
      <span>{labels[kind] ?? kind}</span>
    </button>
  {/each}
</div>

<style>
  .tray {
    display: flex;
    gap: 12px;
    padding: 10px 14px;
    background: var(--panel);
    border-radius: 16px;
    box-shadow: 0 4px 20px #0002;
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 76px;
    padding: 8px 6px;
    border: 2px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
  }
  button:hover {
    background: #0000000a;
  }
  button.selected {
    border-color: var(--accent);
    background: #3f7fb514;
  }
  svg {
    width: 48px;
    height: 48px;
  }
</style>
