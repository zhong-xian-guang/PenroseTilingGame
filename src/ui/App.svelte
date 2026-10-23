<script lang="ts">
  import { onMount } from 'svelte';
  import { createGame, openingPatch, ORIGIN, P2, toXY, type Game, type TileKind } from '../engine';
  import { Board } from '../board/board';
  import { DEFAULT_PALETTE } from '../board/renderer';
  import Tray from './Tray.svelte';
  import Menu from './Menu.svelte';
  import { t } from '../i18n/index.svelte';

  /** A fresh game starting from a random opening patch. */
  const newGame = (): Game => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    return createGame({ tileSet: P2, opening: openingPatch(seed) });
  };

  // The board holds the game, so a new game re-attaches it (see attach); nothing renders from game directly.
  let game = newGame();

  // Engine state mirrored into Svelte via $state; refreshed from engine events.
  let selected = $state<TileKind | null>(game.selectedKind());
  let tileCount = $state(game.tiles().length);
  let area = $state(0);

  const recompute = () => {
    selected = game.selectedKind();
    const tiles = game.tiles();
    tileCount = tiles.length;
    area = tiles.reduce((s, t) => s + game.tileSet.shapes[t.kind]!.area, 0);
  };
  recompute();

  let canvas: HTMLCanvasElement;
  let trayZone: HTMLElement;
  let board: Board | null = null;
  /** A finger holds the pending tile over the tray (lifting it there removes it). */
  let removing = $state(false);
  /** Touch-first device: show the finger controls in the hint. */
  const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  let offGame: (() => void) | null = null;

  /** (Re)attach the board to the current game; the board centres and zooms on the opening patch. */
  const attach = () => {
    offGame?.();
    board?.destroy();
    board = new Board(canvas, game);
    board.trayElement = trayZone;
    removing = false;
    board.onTrayDropTarget = (r) => (removing = r);
    offGame = game.subscribe((e) => {
      recompute();
      if (e.type === 'selection-changed') board?.refresh();
    });
    recompute();
  };

  const startNewGame = () => {
    game = newGame();
    attach();
  };

  onMount(() => {
    attach();
    return () => {
      offGame?.();
      offGame = null;
      board?.destroy();
      board = null;
    };
  });

  /** Tray icons: each tile kind normalised into a 0–1 box, y flipped for SVG. */
  const icons = Object.fromEntries(
    P2.kinds.map((kind) => {
      const pts = createGame({ opening: [] }).verticesOf({ kind, origin: ORIGIN, dir: 2 }).map(toXY);
      const minX = Math.min(...pts.map((p) => p.x));
      const maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxY = Math.max(...pts.map((p) => p.y));
      const s = Math.max(maxX - minX, maxY - minY);
      const ox = (s - (maxX - minX)) / 2;
      const oy = (s - (maxY - minY)) / 2;
      return [kind, pts.map((p) => `${(p.x - minX + ox) / s},${(maxY - p.y + oy) / s}`).join(' ')];
    }),
  );
  const labels = $derived<Record<TileKind, string>>({ kite: t('tile.kite'), dart: t('tile.dart') });
</script>

<main>
  <canvas bind:this={canvas} aria-label={t('board.label')}></canvas>

  <header class="hud">
    <div><span class="label">{t('hud.tiles')}</span> <strong>{tileCount}</strong></div>
    <div><span class="label">{t('hud.area')}</span> <strong>{area.toFixed(2)}</strong></div>
  </header>

  <Menu />

  <button type="button" class="new-game" onclick={startNewGame}>{t('game.new')}</button>

  <div class="zoom">
    <button type="button" aria-label={t('zoom.in')} onclick={() => board?.zoomBy(1.25)}>+</button>
    <button type="button" aria-label={t('zoom.out')} onclick={() => board?.zoomBy(0.8)}>−</button>
    <button type="button" aria-label={t('zoom.fit')} onclick={() => board?.fitToTiling()}>
      <!-- An icon rather than ⌂, which neither interface font has. -->
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3" stroke="currentColor" stroke-width="1.6" />
      </svg>
    </button>
  </div>

  <footer>
    <p class="hint">
      {#if coarsePointer}
        {t('hint.touch')}
      {:else if selected}
        {t('hint.place')}
      {:else}
        {t('hint.pick')}
      {/if}
    </p>
    <div bind:this={trayZone}>
      <Tray
        kinds={P2.kinds}
        {selected}
        colors={DEFAULT_PALETTE.tiles}
        {icons}
        {labels}
        {removing}
        onselect={(kind) => game.select(kind)}
        ondragout={(kind, e) => board?.beginTrayDrag(kind, e)}
      />
    </div>
  </footer>
</main>

<style>
  main {
    position: relative;
    width: 100%;
    height: 100%;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: grab;
  }
  .hud {
    position: absolute;
    top: 12px;
    left: 16px;
    display: flex;
    gap: 16px;
    padding: 8px 14px;
    background: var(--panel);
    border-radius: 12px;
    box-shadow: 0 2px 10px #0001;
    font-size: 14px;
    pointer-events: none;
  }
  .label {
    color: var(--muted);
  }
  .new-game {
    position: absolute;
    top: 60px;
    left: 16px;
    padding: 8px 14px;
    border: none;
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 2px 10px #0001;
    color: var(--ink);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .zoom {
    position: absolute;
    top: 12px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .zoom button {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: var(--panel);
    box-shadow: 0 2px 10px #0001;
    color: var(--ink);
    font-size: 18px;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  footer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: max(16px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    pointer-events: none;
  }
  footer > :global(*) {
    pointer-events: auto;
  }
  .hint {
    margin: 0;
    padding: 6px 12px;
    background: var(--panel);
    border-radius: 999px;
    font-size: 13px;
    color: var(--muted);
    text-align: center;
  }
</style>
