<script lang="ts">
  /**
   * Minimal end-of-game summary (ticket 04): area, tile count, new game.
   * The fuller summary (personal best, "doomed since step N", details) is ticket 09.
   */
  import type { Score } from '../engine';

  // UI strings kept together so they can move into the i18n catalogue (ticket 13).
  const text = {
    title: '遊戲結束',
    reason: '鋪砌邊界出現了放不進任何拼塊的凹洞。',
    area: '面積',
    areaUnit: '平方單位',
    tiles: '片數',
    newGame: '開新局',
  };

  let { open, score, onnewgame }: { open: boolean; score: Score; onnewgame: () => void } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} oncancel={(e) => e.preventDefault()} aria-labelledby="game-over-title">
  <h2 id="game-over-title">{text.title}</h2>
  <p class="reason">{text.reason}</p>
  <dl>
    <div>
      <dt>{text.area}</dt>
      <dd><strong>{score.area.toFixed(2)}</strong> <span class="unit">{text.areaUnit}</span></dd>
    </div>
    <div>
      <dt>{text.tiles}</dt>
      <dd><strong>{score.tiles}</strong></dd>
    </div>
  </dl>
  <button type="button" onclick={onnewgame}>{text.newGame}</button>
</dialog>

<style>
  dialog {
    border: none;
    border-radius: 16px;
    padding: 20px 24px;
    width: min(320px, calc(100vw - 32px));
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
    margin: 0 0 20px;
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
  }
  .unit {
    font-size: 12px;
    color: var(--muted);
  }
  button {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 10px;
    background: var(--ink);
    color: var(--panel);
    font-size: 15px;
    cursor: pointer;
  }
</style>
