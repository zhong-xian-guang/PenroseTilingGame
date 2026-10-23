<script lang="ts">
  /**
   * Analysis page (ticket 09), opened from the game-over summary's "Details":
   * usage statistics, shape completeness, free/flow share and a replay, all
   * computed from the game record (engine `analyzeRecord` / `replayFrames`).
   */
  import { analyzeRecord, replayFrames, type GameRecord } from '../engine';
  import { t } from '../i18n/index.svelte';
  import Replay from './Replay.svelte';

  let { open, record, onback }: { open: boolean; record: GameRecord | null; onback: () => void } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  // Only computed while open: the record is replayed once for each.
  const stats = $derived(open && record ? analyzeRecord(record) : null);
  const frames = $derived(open && record ? replayFrames(record) : []);

  /** φ: the kite-to-dart ratio of an infinite P2 tiling. */
  const ideal = (1 + Math.sqrt(5)) / 2;
  const percent = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);
  const places = $derived(stats ? stats.modes.free + stats.modes.flow : 0);
  // A game with no placement at all counts as fully free.
  const freePct = $derived(stats ? (places > 0 ? percent(stats.modes.free, places) : 100) : 0);
</script>

<dialog
  bind:this={dialog}
  oncancel={(e) => {
    e.preventDefault();
    onback();
  }}
  aria-labelledby="analysis-title"
>
  <header>
    <button type="button" class="back" onclick={onback}>{t('analysis.back')}</button>
    <h2 id="analysis-title">{t('analysis.title')}</h2>
  </header>

  {#if stats}
    <section>
      <h3>{t('analysis.usage')}</h3>
      <dl class="grid">
        <div>
          <dt>{t('hud.tiles')}</dt>
          <dd><strong>{stats.tiles}</strong></dd>
        </div>
        <div>
          <dt>{t('hud.area')}</dt>
          <dd><strong>{stats.area.toFixed(2)}</strong> <span class="unit">{t('gameOver.areaUnit')}</span></dd>
        </div>
        <div>
          <dt>{t('tile.kite')}</dt>
          <dd><strong>{stats.kites}</strong></dd>
        </div>
        <div>
          <dt>{t('tile.dart')}</dt>
          <dd><strong>{stats.darts}</strong></dd>
        </div>
        <div class="wide">
          <dt>{t('analysis.ratio')}</dt>
          <dd>
            {#if stats.kiteDartRatio === null}
              <strong>{t('analysis.ratioNone')}</strong>
            {:else}
              <strong>{stats.kiteDartRatio.toFixed(3)}</strong>
            {/if}
            <span class="unit">{t('analysis.ratioIdeal')}</span>
            {#if stats.kiteDartRatio !== null}
              <!-- the ratio against φ on a 0..2φ bar, φ marked in the middle -->
              <svg class="bar" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                <rect x="0" y="3" width="200" height="6" rx="3" fill="var(--muted)" opacity="0.25" />
                <rect
                  x="0"
                  y="3"
                  width={Math.min(200, (100 * stats.kiteDartRatio) / ideal)}
                  height="6"
                  rx="3"
                  fill="var(--ink)"
                />
                <rect x="99" y="0" width="2" height="12" fill="var(--accent, #d1495b)" />
              </svg>
            {/if}
          </dd>
        </div>
      </dl>
    </section>

    <section>
      <h3>{t('analysis.shape')}</h3>
      <dl class="grid">
        <div>
          <dt>{t('analysis.completeRadius')}</dt>
          <dd>
            <strong>{stats.completeRadius.toFixed(2)}</strong> <span class="unit">{t('analysis.lengthUnit')}</span>
          </dd>
          <p class="hint">{t('analysis.completeRadiusHint')}</p>
        </div>
        <div>
          <dt>{t('analysis.roundness')}</dt>
          <dd><strong>{Math.round(stats.roundness * 100)}%</strong></dd>
          <p class="hint">{t('analysis.roundnessHint')}</p>
        </div>
      </dl>
    </section>

    <section>
      <h3>{t('analysis.modes')}</h3>
      <p class="modes">{t('analysis.modesValue', { free: freePct, flow: 100 - freePct })}</p>
    </section>

    <!--
      Ticket 10 (mistake backtrace) goes here: "doomed since step N" plus markers
      on the replay (the doomed step and the final dead end). Replay.svelte would
      take the step index to highlight / seek to.
    -->

    <section>
      <h3>{t('analysis.replay')}</h3>
      <Replay {frames} />
    </section>
  {/if}
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 16px 20px 20px;
    border: none;
    border-radius: 16px;
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 8px 40px #0003;
  }
  dialog::backdrop {
    background: #0004;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
  }
  .back {
    height: 32px;
    padding: 0 12px;
    border: none;
    border-radius: 10px;
    background: var(--panel);
    box-shadow: 0 1px 6px #0001;
    color: var(--ink);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  section {
    margin-top: 16px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 10px;
    margin: 0;
  }
  .grid > div {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--panel);
  }
  .grid > .wide {
    grid-column: 1 / -1;
  }
  dt {
    font-size: 13px;
    color: var(--muted);
  }
  dd {
    margin: 4px 0 0;
    font-size: 14px;
  }
  dd strong {
    font-size: 20px;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 12px;
    color: var(--muted);
  }
  .bar {
    display: block;
    width: 100%;
    height: 12px;
    margin-top: 6px;
  }
  .hint {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
  }
  .modes {
    margin: 0;
    font-size: 15px;
  }
</style>
