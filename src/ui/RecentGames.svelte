<script lang="ts">
  /**
   * Recent games (story 66): the games autosave keeps on this device, newest
   * first, with date, tiles and area. Picking one opens it on the analysis
   * page, view-only (the same path as a shared record, ticket 11).
   */
  import { replayRecord, type GameRecord } from '../engine';
  import { t } from '../i18n/index.svelte';
  import { RECENT_GAMES, recentGames, type SavedGame } from '../storage/autosave';

  let { onopen }: { onopen: (record: GameRecord) => void } = $props();

  let dialog: HTMLDialogElement;
  let opener: HTMLButtonElement;

  interface Row {
    readonly game: SavedGame;
    /** Undefined while the record is being replayed; null when it cannot be replayed. */
    summary?: { tiles: number; area: number; over: boolean } | null;
  }
  /** Null while loading. */
  let rows = $state<Row[] | null>(null);
  let generation = 0;

  const show = async () => {
    dialog.showModal();
    const mine = ++generation;
    rows = null;
    let games: SavedGame[] = [];
    try {
      games = await recentGames();
    } catch {
      // storage unavailable: nothing to list
    }
    if (mine !== generation) return;
    rows = games.map((game) => ({ game }));
    // replay one record per task, so the list shows at once and fills in
    for (let i = 0; i < rows.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (mine !== generation || !rows) return;
      try {
        const replayed = replayRecord(rows[i]!.game.record);
        const { tiles, area } = replayed.score();
        rows[i]!.summary = { tiles, area, over: replayed.status() === 'over' };
      } catch {
        rows[i]!.summary = null;
      }
    }
  };

  const two = (n: number) => String(n).padStart(2, '0');
  const when = (ms: number) => {
    const d = new Date(ms);
    return t('recent.time', {
      y: d.getFullYear(),
      m: two(d.getMonth() + 1),
      d: two(d.getDate()),
      hh: two(d.getHours()),
      mm: two(d.getMinutes()),
    });
  };

  const open = (row: Row) => {
    dialog.close();
    // plain copy: the $state proxy can't be structured-cloned to the backtrace worker
    onopen($state.snapshot(row.game.record) as GameRecord);
  };
</script>

<button type="button" bind:this={opener} onclick={show}>{t('recent.open')}</button>

<dialog bind:this={dialog} aria-labelledby="recent-title" onclose={() => {
    generation++;
    opener.focus();
  }}>
  <h2 id="recent-title">{t('recent.title')}</h2>
  <p>{t('recent.intro', { n: RECENT_GAMES })}</p>
  {#if rows === null}
    <p class="muted">{t('recent.loading')}</p>
  {:else if rows.length === 0}
    <p class="muted">{t('recent.empty')}</p>
  {:else}
    <ul>
      {#each rows as row (row.game.id)}
        <li>
          <button type="button" class="game" disabled={row.summary === null} onclick={() => open(row)}>
            <span class="when">{when(row.game.startedAt)}</span>
            <span class="what">
              {#if row.summary === undefined}
                {t('recent.loading')}
              {:else if row.summary === null}
                {t('recent.unreadable')}
              {:else}
                {t('recent.summary', { tiles: row.summary.tiles, area: row.summary.area.toFixed(2) })}
                <span class="muted">{row.summary.over ? t('recent.over') : t('recent.playing')}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <form method="dialog">
    <button type="submit">{t('recent.close')}</button>
  </form>
</dialog>

<style>
  button {
    height: 36px;
    padding: 0 12px;
    border: none;
    border-radius: 10px;
    background: var(--panel);
    box-shadow: 0 2px 10px #0001;
    color: var(--ink);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  dialog {
    width: min(480px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 20px 24px;
    border: none;
    border-radius: 16px;
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 8px 40px #0003;
  }
  dialog::backdrop {
    background: #0004;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 20px;
    font-weight: 800;
  }
  p {
    margin: 0 0 8px;
    line-height: 1.6;
    font-size: 14px;
  }
  .muted {
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .game {
    width: 100%;
    height: auto;
    min-height: 44px;
    padding: 8px 12px;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 12px;
    text-align: left;
    box-shadow: none;
  }
  .game:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .when {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .what {
    display: flex;
    gap: 8px;
  }
  form {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
</style>
