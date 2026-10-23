<script lang="ts">
  import { i18n, t } from '../i18n/index.svelte';
  import oflText from '../fonts/OFL.txt?raw';

  let about: HTMLDialogElement;
</script>

<nav class="menu">
  <button type="button" aria-label={t('language.switch')} onclick={() => i18n.toggle()}>
    {t('language.other')}
  </button>
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
    gap: 6px;
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
