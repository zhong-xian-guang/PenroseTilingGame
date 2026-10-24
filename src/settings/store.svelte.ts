/**
 * The current display settings as reactive `$state`, shared by the settings
 * panel (writes) and the App (applies them to the board). Changes are saved to
 * IndexedDB, debounced so dragging a colour picker doesn't write every frame.
 */
import { loadSettings, saveSettings } from '../storage/settings';
import { DEFAULT_SETTINGS, type Settings } from './palette';

let current = $state<Settings>(DEFAULT_SETTINGS);
let timer: ReturnType<typeof setTimeout> | undefined;

export const displaySettings = {
  get value(): Settings {
    return current;
  },
  update(patch: Partial<Settings>) {
    current = { ...current, ...patch };
    clearTimeout(timer);
    const snapshot = current;
    timer = setTimeout(() => void saveSettings(snapshot), 250);
  },
  /** Replace the defaults with the saved settings (once, at startup). */
  async load() {
    const saved = await loadSettings();
    if (timer === undefined) current = saved; // the player already changed something: keep that
  },
};
