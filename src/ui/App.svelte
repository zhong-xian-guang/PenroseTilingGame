<script lang="ts">
  import { onMount } from 'svelte';
  import { createGame, openingPatch, ORIGIN, P2, RECORD_VERSION, toXY, type Game, type GameRecord, type Score, type TileKind } from '../engine';
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
  import { readRecordFile, readShareHash, ShareError } from '../share/share';

  /** A fresh game starting from a random opening patch. */
  const newGame = (): Game => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    return createGame({ tileSet: P2, opening: openingPatch(seed), seed });
  };

  // The board holds the game, so a new game re-attaches it (see attach); nothing renders from game directly.
  let game = newGame();

  // Engine state mirrored into Svelte via $state; refreshed from engine events.
  let selected = $state<TileKind | null>(game.selectedKind());
  let score = $state<Score>(game.score());
  let over = $state(game.status() === 'over');
  /** The finished game compared with the personal best of its tile set (submitted once per finished game). */
  let best = $state<BestComparison | null>(null);
  let bestFor: Game | null = null;
  /** The analysis page is open (in place of the summary); it shows `analysisRecord`. */
  let analysisOpen = $state(false);
  let analysisRecord = $state.raw<GameRecord | null>(null);
  /**
   * The analysis page shows someone else's record (share link or imported file, ticket 11). Such a record is
   * only replayed for viewing: the own game, its autosave and the personal best are never touched.
   */
  let analysisShared = $state(false);
  /** Why a shared record could not be opened. */
  let shareError = $state<ShareError | null>(null);
  let shareErrorDialog: HTMLDialogElement;
  $effect(() => {
    if (shareError && !shareErrorDialog.open) shareErrorDialog.showModal();
  });

  const viewShared = (record: GameRecord) => {
    analysisRecord = record;
    analysisShared = true;
    analysisOpen = true;
  };
  const showShareError = (e: unknown) => {
    shareError = e instanceof ShareError ? e : new ShareError('malformed');
  };
  /** Opens the record in the page address (`#r=…`), then drops it from the address so a reload does not reopen it. */
  const openSharedLink = async () => {
    try {
      const record = await readShareHash(location.hash);
      if (!record) return;
      history.replaceState(null, '', location.pathname + location.search);
      viewShared(record);
    } catch (e) {
      history.replaceState(null, '', location.pathname + location.search);
      showShareError(e);
    }
  };
  const importRecord = async (file: File) => {
    try {
      viewShared(readRecordFile(await file.text()));
    } catch (e) {
      showShareError(e);
    }
  };

  const recompute = () => {
    selected = game.selectedKind();
    score = game.score();
    over = game.status() === 'over';
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
    board = new Board(canvas, game);
    board.trayElement = trayZone;
    removing = false;
    board.onTrayDropTarget = (r) => (removing = r);
    applySettings();
    offGame = game.subscribe((e) => {
      recompute();
      if (e.type === 'selection-changed') board?.refresh();
    });
    recompute();
  };

  // Every step is saved automatically; on load the last game resumes (no manual save/load).
  let autosave: Autosave | null = null;

  const startNewGame = () => {
    analysisOpen = false;
    game = newGame();
    attach();
    void autosave?.track(game);
  };

  onMount(() => {
    attach();
    void displaySettings.load();
    void openSharedLink();
    const onHash = () => void openSharedLink();
    addEventListener('hashchange', onHash);
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
      removeEventListener('hashchange', onHash);
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

  <Menu onimport={importRecord} />

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
      analysisShared = false;
      analysisOpen = true;
    }}
    onnewgame={startNewGame}
  />
  <AnalysisPage
    open={analysisOpen}
    record={analysisRecord}
    shared={analysisShared}
    {palette}
    showArcs={displaySettings.value.showArcs}
    onback={() => (analysisOpen = false)}
  />

  <dialog
    bind:this={shareErrorDialog}
    class="share-error"
    aria-labelledby="share-error-title"
    onclose={() => (shareError = null)}
  >
    <h2 id="share-error-title">{t('share.error.title')}</h2>
    <p>
      {#if shareError?.reason === 'version'}
        {t('share.error.version', { version: shareError.version ?? '?', expected: RECORD_VERSION })}
      {:else}
        {t('share.error.malformed')}
      {/if}
    </p>
    <form method="dialog">
      <button type="submit">{t('share.error.close')}</button>
    </form>
  </dialog>
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
  .share-error {
    width: min(420px, calc(100vw - 32px));
    padding: 20px 24px;
    border: none;
    border-radius: 16px;
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 8px 40px #0003;
  }
  .share-error::backdrop {
    background: #0004;
  }
  .share-error h2 {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 800;
  }
  .share-error p {
    margin: 0 0 12px;
    line-height: 1.6;
    font-size: 14px;
  }
  .share-error form {
    display: flex;
    justify-content: flex-end;
  }
  .share-error button {
    height: 36px;
    padding: 0 16px;
    border: none;
    border-radius: 10px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
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
