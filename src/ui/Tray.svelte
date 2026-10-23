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
    /** A finger (touch or pen) went down on a tile: it may carry it out onto the board. */
    ondragout?: (kind: TileKind, e: PointerEvent) => void;
    /** A finger holds the pending tile over the tray: lifting it there removes it. */
    removing?: boolean;
  }

  let { kinds, selected, colors, icons, labels, onselect, ondragout, removing = false }: Props = $props();

  // A finger press is handled as a drag-out (which also selects); swallow the click that follows it.
  let fingerPress = false;
  const onpointerdown = (kind: TileKind, e: PointerEvent) => {
    fingerPress = e.pointerType !== 'mouse' && !!ondragout;
    if (fingerPress) ondragout?.(kind, e);
  };
  const onclick = (kind: TileKind) => {
    if (fingerPress) {
      fingerPress = false;
      return;
    }
    onselect(selected === kind ? null : kind);
  };
</script>

<div class="tray" class:removing role="toolbar" aria-label={t('tray.label')}>
  {#each kinds as kind (kind)}
    <button
      type="button"
      class:selected={selected === kind}
      aria-pressed={selected === kind}
      onpointerdown={(e) => onpointerdown(kind, e)}
      onclick={() => onclick(kind)}
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
    outline: 2px dashed transparent;
    outline-offset: 3px;
    transition: outline-color 0.12s;
  }
  .tray.removing {
    outline-color: var(--accent);
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
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    /* a finger drag out of the tray must not scroll or zoom the page */
    touch-action: none;
  }
  @media (hover: hover) {
    button:hover {
      background: #0000000a;
    }
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
