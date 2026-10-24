<script lang="ts">
  /**
   * Replay of a game record (ticket 09): a read-only board drawn from
   * precomputed frames (engine `replayFrames`), with play/pause and a seek bar.
   * Frame 0 is the opening; frame i is the position after step i.
   * Ticket 10: marks the step the game was doomed by (a tick on the seek bar,
   * and that step's tile outlined while it is shown) and the final dead ends
   * (dashed rings in every frame).
   */
  import { toXY, type PlacedTile, type Point, type ReplayFrame } from '../engine';
  import { Camera } from '../board/camera';
  import { DEFAULT_PALETTE, drawBoard, type Palette } from '../board/renderer';
  import { t } from '../i18n/index.svelte';

  let {
    frames,
    palette = DEFAULT_PALETTE,
    showArcs = true,
    index = $bindable(0),
    doomedStep = null,
    finalDeadEnds = [],
  }: {
    frames: readonly ReplayFrame[];
    palette?: Palette;
    showArcs?: boolean;
    /** The frame shown. */
    index?: number;
    /** Step (= frame index) the game was doomed by at the latest, to mark. */
    doomedStep?: number | null;
    /** Dead ends the game ended on, ringed in every frame. */
    finalDeadEnds?: readonly { readonly from: Point; readonly to: Point }[];
  } = $props();

  const last = $derived(Math.max(0, frames.length - 1));
  let playing = $state(false);
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);

  // Start at the final position whenever a new record comes in.
  $effect(() => {
    index = frames.length - 1;
    playing = false;
  });

  /** About six seconds for a whole game, but never faster than 60 ms or slower than 400 ms a step. */
  const stepMs = $derived(Math.min(400, Math.max(60, 6000 / Math.max(1, last))));

  $effect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (index >= last) playing = false;
      else index++;
    }, stepMs);
    return () => clearInterval(timer);
  });

  const toggle = () => {
    if (!playing && index >= last) index = 0;
    playing = !playing;
  };

  /** Bounding box of every tile the game ever had (tiles only ever get added, bar the pending one). */
  const bounds = $derived.by(() => {
    const min = { x: Infinity, y: Infinity };
    const max = { x: -Infinity, y: -Infinity };
    const add = (tile: PlacedTile | null) => {
      for (const v of tile?.vertices ?? []) {
        const p = toXY(v);
        min.x = Math.min(min.x, p.x);
        min.y = Math.min(min.y, p.y);
        max.x = Math.max(max.x, p.x);
        max.y = Math.max(max.y, p.y);
      }
    };
    // every tile is pending in some frame or confirmed in the last one
    for (const f of frames) add(f.pendingTile());
    for (const tile of frames.at(-1)?.confirmedTiles() ?? []) add(tile);
    return Number.isFinite(min.x) ? { min, max } : null;
  });

  // Draw the current frame, framed so the camera never moves during the replay.
  $effect(() => {
    const frame = frames[index];
    if (!frame || !canvas || width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const camera = new Camera();
    camera.width = width;
    camera.height = height;
    if (bounds) camera.fit(bounds.min, bounds.max, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBoard(ctx, frame, camera, dpr, palette, { showArcs, pendingHovered: false, preview: null });
    drawMarks(ctx, camera, frame);
  });

  /** Backtrace marks over a drawn frame (screen space; ctx is already scaled for the DPR). */
  function drawMarks(ctx: CanvasRenderingContext2D, camera: Camera, frame: ReplayFrame) {
    ctx.save();
    ctx.strokeStyle = palette.deadEnd;
    // the final dead ends: a dashed ring around each, so it shows where the game will get stuck
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    for (const { from, to } of finalDeadEnds) {
      const a = toXY(from);
      const b = toXY(to);
      const c = camera.toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(14, camera.scale * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    // the doomed step: the tile put down (or turned) by that step, outlined boldly
    const tile = doomedStep !== null && index === doomedStep ? frame.pendingTile() : null;
    if (tile) {
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(3, camera.scale * 0.08);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      tile.vertices.forEach((v, i) => {
        const s = camera.toScreen(toXY(v));
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
</script>

<div class="replay">
  <div class="stage" bind:clientWidth={width} bind:clientHeight={height}>
    <canvas bind:this={canvas}></canvas>
  </div>
  <div class="controls">
    <button type="button" aria-label={playing ? t('analysis.pause') : t('analysis.play')} onclick={toggle}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {#if playing}
          <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
        {:else}
          <path d="M4 2.5v11l9.5-5.5z" fill="currentColor" />
        {/if}
      </svg>
    </button>
    <div class="seek">
    <input
      type="range"
      min="0"
      max={last}
      step="1"
      bind:value={index}
      oninput={() => (playing = false)}
      aria-label={t('analysis.seek')}
    />
    {#if doomedStep !== null && last > 0}
      <!-- tick under the seek bar at the doomed step -->
      <span
        class="tick"
        style:left="calc(8px + (100% - 16px) * {doomedStep / last})"
        style:border-bottom-color={palette.deadEnd}
        aria-hidden="true"
      ></span>
    {/if}
    </div>
    <span class="step">{t('analysis.step', { n: index, total: last })}</span>
  </div>
</div>

<style>
  .replay {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    max-height: 50dvh;
    border-radius: 12px;
    overflow: hidden;
    background: var(--panel);
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  button {
    width: 36px;
    height: 36px;
    flex: none;
    border: none;
    border-radius: 10px;
    background: var(--ink);
    color: var(--panel);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .seek {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }
  input[type='range'] {
    flex: 1;
    min-width: 0;
    accent-color: var(--ink);
  }
  .tick {
    position: absolute;
    bottom: -6px;
    width: 0;
    height: 0;
    margin-left: -5px;
    border: 5px solid transparent;
    border-bottom: 6px solid;
    border-top: none;
    pointer-events: none;
  }
  .step {
    flex: none;
    font-size: 13px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
