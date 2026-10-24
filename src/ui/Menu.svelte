<script lang="ts">
  import { i18n, t } from '../i18n/index.svelte';
  import oflText from '../fonts/OFL.txt?raw';
  import type { GameRecord } from '../engine';
  import SettingsDialog from './SettingsDialog.svelte';
  import RecentGames from './RecentGames.svelte';

  let {
    onimport,
    onopenrecord,
  }: {
    /** A record file picked through "Open record" (ticket 11). */
    onimport?: (file: File) => void;
    /** A saved game picked from "Recent games". */
    onopenrecord?: (record: GameRecord) => void;
  } = $props();

  let about: HTMLDialogElement;
  let fileInput: HTMLInputElement;
  let nav: HTMLElement;
  /**
   * Phone width only (see the CSS): the items fold behind a toggle, because a row of them wraps over the
   * score HUD and a column of them covers the board, where it takes the fingers of a pinch.
   */
  let open = $state(false);
  $effect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!nav.contains(e.target as Node)) open = false;
    };
    addEventListener('pointerdown', close, true);
    return () => removeEventListener('pointerdown', close, true);
  });
  /** An item was picked: fold the menu (an item's dialog is a sibling of its button, so it stays visible). */
  const picked = (e: MouseEvent) => {
    const target = e.target as Element;
    const item = target.closest('button');
    if (item && item.parentElement === nav && !item.classList.contains('toggle')) open = false;
  };
</script>

<nav class="menu" class:open bind:this={nav} onclickcapture={picked}>
  <button
    type="button"
    class="toggle"
    aria-label={t('menu.label')}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  </button>
  <button type="button" aria-label={t('language.switch')} onclick={() => i18n.toggle()}>
    {t('language.other')}
  </button>
  <SettingsDialog />
  <RecentGames onopen={(record) => onopenrecord?.(record)} />
  <button type="button" onclick={() => fileInput.click()}>{t('share.open')}</button>
  <input
    bind:this={fileInput}
    type="file"
    accept=".json,application/json"
    hidden
    onchange={() => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) onimport?.(file);
    }}
  />
  <button type="button" onclick={() => about.showModal()}>{t('about.open')}</button>
</nav>

<dialog bind:this={about} aria-labelledby="about-title">
  <h2 id="about-title">{t('about.title')}</h2>
  <p>{t('about.intro')}</p>
  <h3>{t('about.fonts.title')}</h3>
  <p>{t('about.fonts.credit')}</p>
  <details>
    <summary>{t('about.fonts.license')}</summary>
    <pre lang="en">{oflText}</pre>
  </details>
  <form method="dialog">
    <button type="submit">{t('about.close')}</button>
  </form>
</dialog>

<style>
  .menu {
    position: absolute;
    top: 12px;
    right: 64px;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: calc(100vw - 80px);
    gap: 6px;
  }
  .toggle {
    display: none;
  }
  /* Phone width: the menu row would wrap over the score HUD (seen on a 375 px wide Android phone), so it
     folds behind a toggle under the zoom buttons (3 × 36 px + gaps, from top 12 px) and opens as a column. */
  @media (max-width: 720px) {
    .menu {
      top: 144px;
      right: 16px;
      flex-direction: column;
      align-items: flex-end;
      max-width: none;
    }
    .toggle {
      display: grid;
      place-items: center;
      width: 36px;
      padding: 0;
    }
    .menu:not(.open) > :global(button:not(.toggle)) {
      display: none;
    }
  }
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
    width: min(560px, calc(100vw - 32px));
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
  h3 {
    margin: 16px 0 4px;
    font-size: 15px;
    font-weight: 700;
  }
  p {
    margin: 0 0 8px;
    line-height: 1.6;
    font-size: 14px;
  }
  summary {
    cursor: pointer;
    font-size: 14px;
    color: var(--accent);
  }
  pre {
    max-height: 40dvh;
    overflow: auto;
    padding: 12px;
    background: var(--panel);
    border-radius: 8px;
    font-family: inherit;
    font-size: 12px;
    white-space: pre-wrap;
  }
  form {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
</style>
