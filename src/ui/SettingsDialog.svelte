<script lang="ts">
  import { t, type MessageKey } from '../i18n/index.svelte';
  import { PRESETS, matchPreset, type ColorChoice } from '../settings/palette';
  import { displaySettings } from '../settings/store.svelte';

  let dialog: HTMLDialogElement;
  let opener: HTMLButtonElement;

  const settings = $derived(displaySettings.value);
  const activePreset = $derived(matchPreset(settings.colors));
  const fields: { key: keyof ColorChoice; label: MessageKey }[] = [
    { key: 'kite', label: 'tile.kite' },
    { key: 'dart', label: 'tile.dart' },
    { key: 'background', label: 'settings.background' },
  ];

  const setColor = (key: keyof ColorChoice, value: string) =>
    displaySettings.update({ colors: { ...settings.colors, [key]: value } });
</script>

<button type="button" bind:this={opener} onclick={() => dialog.showModal()}>{t('settings.open')}</button>

<!-- Esc closes a modal <dialog> natively; on close, focus goes back to the button that opened it. -->
<dialog bind:this={dialog} aria-labelledby="settings-title" onclose={() => opener.focus()}>
  <h2 id="settings-title">{t('settings.title')}</h2>

  <h3>{t('settings.presets')}</h3>
  <div class="presets">
    {#each PRESETS as preset (preset.id)}
      <button
        type="button"
        class="preset"
        aria-pressed={activePreset === preset.id}
        onclick={() => displaySettings.update({ colors: { ...preset.colors } })}
      >
        <span class="swatches" aria-hidden="true" style:background={preset.colors.background}>
          <span style:background={preset.colors.kite}></span>
          <span style:background={preset.colors.dart}></span>
        </span>
        {t(`settings.preset.${preset.id}` as MessageKey)}
      </button>
    {/each}
  </div>

  <h3>{t('settings.colors')}</h3>
  <div class="colors">
    {#each fields as field (field.key)}
      <label>
        <input
          type="color"
          value={settings.colors[field.key]}
          oninput={(e) => setColor(field.key, e.currentTarget.value)}
        />
        {t(field.label)}
      </label>
    {/each}
  </div>

  <form method="dialog">
    <button type="submit" class="close">{t('settings.close')}</button>
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
  h3 {
    margin: 16px 0 8px;
    font-size: 15px;
    font-weight: 700;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .preset {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px 0 6px;
    outline: 2px solid transparent;
  }
  .preset[aria-pressed='true'] {
    outline-color: var(--accent);
  }
  .swatches {
    display: flex;
    gap: 3px;
    padding: 4px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px #0002;
  }
  .swatches span {
    width: 12px;
    height: 16px;
    border-radius: 3px;
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  input[type='color'] {
    width: 40px;
    height: 32px;
    padding: 2px;
    border: 1px solid #0002;
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
  }
  form {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
