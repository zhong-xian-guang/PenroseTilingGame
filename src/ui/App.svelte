<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createGame,
    openingPatch,
    ORIGIN,
    P2,
    toXY,
    type Game,
    type GameRecord,
    type PlayMode,
    type Score,
    type TileKind,
  } from '../engine';
  import { Board } from '../board/board';
  import { DEFAULT_PALETTE, type Palette } from '../board/renderer';
  import { derivePalette } from '../settings/palette';
  import { displaySettings } from '../settings/store.svelte';
  import { Autosave } from '../storage/autosave';
  import { submitScore, type BestComparison } from '../storage/best';
  import Tray from './Tray.svelte';
  import Menu from './Menu.svelte';
  import GameOverDialog from './GameOverDialog.svelte';
  import AnalysisPage from './AnalysisPage.svelte';
  import { t } from '../i18n/index.svelte';

  /** A fresh game starting from a random opening patch, in `mode`. */
  const newGame = (mode: PlayMode = 'free'): Game => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    return createGame({ tileSet: P2, opening: openingPatch(seed), seed, mode });
  };

  // The board holds the game, so a new game re-attaches it (see attach); nothing renders from game directly.
  let game = newGame();

  // Engine state mirrored into Svelte via $state; refreshed from engine events.
  let selected = $state<TileKind | null>(game.selectedKind());
  let score = $state<Score>(game.score());
  let over = $state(game.status() === 'over');
  let mode = $state<PlayMode>(game.mode());
  /** Flow mode: is there a spot to recommend, and does the selected kind fit it? */
  let flowSpot = $state(false);
  let flowFits = $state(false);
  /** The finished game compared with the personal best of its tile set (submitted once per finished game). */
  let best = $state<BestComparison | null>(null);
  let bestFor: Game | null = null;
  /** The analysis page is open (in place of the summary); it shows `analysisRecord`. */
  let analysisOpen = $state(false);
  let analysisRecord = $state.raw<GameRecord | null>(null);

  const recompute = () => {
    selected = game.selectedKind();
    score = game.score();
    over = game.status() === 'over';
    mode = game.mode();
    const spot = mode === 'flow' ? game.flowSpot() : null;
    flowSpot = spot !== null;
    flowFits = !!spot && !!selected && game.orientationsAt(spot.position, selected).length > 0;
    if (over && bestFor !== game) {
      const finished = game;
      bestFor = finished;
      best = null;
      void submitScore(finished.tileSet.id, finished.score()).then((c) => {
        if (game === finished) best = c;
      });
    }
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

  // Display settings (colours, Conway arcs) → board palette; derived colours override the defaults.
  const palette = $derived<Palette>({ ...DEFAULT_PALETTE, ...derivePalette(displaySettings.value.colors) });
  const applySettings = () => {
    // read the reactive values before the guard, so the $effect below always tracks them
    const next = palette;
    const showArcs = displaySettings.value.showArcs;
    if (!board) return;
    board.palette = next;
    board.showArcs = showArcs;
    board.requestDraw();
  };
  $effect(applySettings);

  /** (Re)attach the board to the current game; the board centres and zooms on the opening patch. */
  const attach = () => {
    offGame?.();
    board?.destroy();
    board = new Board(canvas, game);    board.trayElement = trayZone;
    removing = false;
    board.onTrayDropTarget = (r) => (removing = r);
    applySettings();
    offGame = game.subscribe((e) => {
      recompute();
      if (e.type === 'selection-changed' || e.type === 'mode-changed') board?.refresh();
    });
    recompute();
  };

  // Every step is saved automatically; on load the last game resumes (no manual save/load).
  let autosave: Autosave | null = null;

  const startNewGame = () => {
    analysisOpen = false;
    game = newGame(game.mode());
    attach();
    void autosave?.track(game);
  };

  onMount(() => {
    attach();
    void displaySettings.load();
    let alive = true;
    void (async () => {
      const store = await Autosave.open();
      if (!alive || !store) return;
      autosave = store;
      const resumed = await store.resume().catch(() => null);
      if (!alive) return;
      if (resumed) {
        game = resumed;
        attach();
      } else {
        void store.track(game);
      }
    })();
    return () => {
      alive = false;
      autosave?.detach();
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
    <div><span class="label">{t('hud.tiles')}</span> <strong>{score.tiles}</strong></div>
    <div><span class="label">{t('hud.area')}</span> <strong>{score.area.toFixed(2)}</strong></div>
  </header>

  <Menu />

  <button type="button" class="new-game" onclick={startNewGame}>{t('game.new')}</button>

  <div class="mode" role="radiogroup" aria-label={t('mode.label')}>
    {#each ['free', 'flow'] as const as m (m)}
      <button type="button" role="radio" aria-checked={mode === m} class:on={mode === m} onclick={() => game.setMode(m)}>
        {t(m === 'free' ? 'mode.free' : 'mode.flow')}
      </button>
    {/each}
  </div>

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
      {#if mode === 'flow' && !over && !flowSpot}
        {t('hint.flowNone')}
      {:else if mode === 'flow' && !over && selected && !flowFits}
        {t('hint.flowNoFit')}
      {:else if mode === 'flow' && !over && selected}
        {t(coarsePointer ? 'hint.flowTouch' : 'hint.flow')}
      {:else if coarsePointer}
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
        colors={palette.tiles}
        {icons}
        {labels}
        {removing}
        onselect={(kind) => game.select(kind)}
        ondragout={(kind, e) => board?.beginTrayDrag(kind, e)}
      />
    </div>
  </footer>

  <GameOverDialog
    open={over && !analysisOpen}
    {score}
    {best}
    ondetails={() => {
      analysisRecord = game.record();
      analysisOpen = true;
    }}
    onnewgame={startNewGame}
  />
  <AnalysisPage
    open={analysisOpen}
    record={analysisRecord}
    {palette}
    showArcs={displaySettings.value.showArcs}
    onback={() => (analysisOpen = false)}
  />
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
  .mode {
    position: absolute;
    top: 108px;
    left: 16px;
    display: flex;
    padding: 3px;
    gap: 2px;
    background: var(--panel);
    border-radius: 12px;
    box-shadow: 0 2px 10px #0001;
  }
  .mode button {
    padding: 5px 12px;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .mode button.on {
    background: var(--accent);
    color: #fff;
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
