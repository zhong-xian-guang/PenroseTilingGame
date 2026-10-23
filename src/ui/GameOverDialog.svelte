<script lang="ts">
  /**
   * End-of-game summary (tickets 04, 09): area (animated with NumberFlow), tile
   * count, the comparison with the personal best of this tile set, "Details"
   * (the analysis page) and a new game.
   * Ticket 10 adds "doomed since step N" here.
   */
  import NumberFlow from '@number-flow/svelte';
  import type { Score } from '../engine';
  import type { BestComparison } from '../storage/best';
  import { t } from '../i18n/index.svelte';

  let {
    open,
    score,
    best,
    ondetails,
    onnewgame,
  }: {
    open: boolean;
    score: Score;
    /** Null while the stored best is still being read (or storage is unavailable). */
    best: BestComparison | null;
    ondetails: () => void;
    onnewgame: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  /** The area shown: counts up from 0 each time the dialog opens. */
  let shownArea = $state(0);

  $effect(() => {
    if (open && !dialog.open) {
      dialog.showModal();
      shownArea = 0;
      requestAnimationFrame(() => (shownArea = score.area));
    } else if (!open && dialog.open) dialog.close();
  });

  const twoDecimals = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const diff = $derived(best?.previous ? best.previous.area - score.area : 0);
</script>

<dialog bind:this={dialog} oncancel={(e) => e.preventDefault()} aria-labelledby="game-over-title">
  <h2 id="game-over-title">{t('gameOver.title')}</h2>
  <p class="reason">{t('gameOver.reason')}</p>
  <dl>
    <div>
      <dt>{t('hud.area')}</dt>
      <dd>
        <strong><NumberFlow value={shownArea} format={twoDecimals} /></strong>
        <span class="unit">{t('gameOver.areaUnit')}</span>
      </dd>
    </div>
    <div>
      <dt>{t('hud.tiles')}</dt>
      <dd><strong>{score.tiles}</strong></dd>
    </div>
  </dl>

  {#if best}
    <p class="best" class:new={best.isNewBest}>
      {#if best.isNewBest}
        {t('gameOver.newBest')}
      {:else if diff <= 0}
        {t('gameOver.tiedBest')}
      {:else}
        {t('gameOver.belowBest', { diff: diff.toFixed(2) })}
      {/if}
      <span class="best-value">
        {t('gameOver.best')}
        {best.best.area.toFixed(2)}
        {t('gameOver.areaUnit')}
      </span>
    </p>
  {/if}

  <div class="actions">
    <button type="button" class="secondary" onclick={ondetails}>{t('gameOver.details')}</button>
    <button type="button" onclick={onnewgame}>{t('game.new')}</button>
  </div>
</dialog>

<style>
  dialog {
    border: none;
    border-radius: 16px;
    padding: 20px 24px;
    width: min(340px, calc(100vw - 32px));
    background: var(--panel);
    color: var(--ink);
    box-shadow: 0 8px 32px #0003;
    text-align: center;
  }
  dialog::backdrop {
    background: #0004;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 20px;
  }
  .reason {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--muted);
  }
  dl {
    display: flex;
    justify-content: center;
    gap: 32px;
    margin: 0 0 12px;
  }
  dt {
    font-size: 13px;
    color: var(--muted);
  }
  dd {
    margin: 4px 0 0;
    font-size: 15px;
  }
  dd strong {
    font-size: 24px;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 12px;
    color: var(--muted);
  }
  .best {
    margin: 0 0 16px;
    font-size: 14px;
  }
  .best.new {
    font-weight: 700;
    color: var(--accent);
  }
  .best-value {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  button {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 10px;
    background: var(--ink);
    color: var(--panel);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
  }
  button.secondary {
    background: transparent;
    color: var(--ink);
    box-shadow: inset 0 0 0 1.5px var(--ink);
  }
</style>
