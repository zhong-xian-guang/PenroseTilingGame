<script lang="ts">
  import { onMount } from 'svelte';
  import { createGame, ORIGIN, toXY, type TileKind } from '../engine';
  import { Board } from '../board/board';
  import { DEFAULT_PALETTE } from '../board/renderer';
  import Tray from './Tray.svelte';

  const game = createGame();

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
  let board: Board | null = null;

  onMount(() => {
    board = new Board(canvas, game);
    const off = game.subscribe((e) => {
      recompute();
      if (e.type === 'selection-changed') board?.refresh();
    });
    return () => {
      off();
      board?.destroy();
      board = null;
    };
  });

  /** Tray icons: each tile kind normalised into a 0–1 box, y flipped for SVG. */
  const icons = Object.fromEntries(
    game.tileSet.kinds.map((kind) => {
      const pts = game.verticesOf({ kind, origin: ORIGIN, dir: 2 }).map(toXY);
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
  const labels: Record<TileKind, string> = { kite: '風箏 kite', dart: '飛鏢 dart' };
</script>

<main>
  <canvas bind:this={canvas} aria-label="盤面"></canvas>

  <header class="hud">
    <div><span class="label">片數</span> <strong>{tileCount}</strong></div>
    <div><span class="label">面積</span> <strong>{area.toFixed(2)}</strong></div>
  </header>

  <div class="zoom">
    <button type="button" aria-label="放大" onclick={() => board?.zoomBy(1.25)}>+</button>
    <button type="button" aria-label="縮小" onclick={() => board?.zoomBy(0.8)}>−</button>
    <button type="button" aria-label="置中" onclick={() => board?.fitToTiling()}>⌂</button>
  </div>

  <footer>
    <p class="hint">
      {#if selected}
        移到邊界上看預覽 · <b>滾輪</b> 換方向 · <b>左鍵</b> 放下 · 拖曳平移 · Ctrl + 滾輪縮放
      {:else}
        先在下方挑一片拼塊
      {/if}
    </p>
    <Tray
      kinds={game.tileSet.kinds}
      {selected}
      colors={DEFAULT_PALETTE.tiles}
      {icons}
      {labels}
      onselect={(kind) => game.select(kind)}
    />
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
