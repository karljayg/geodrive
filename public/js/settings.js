// Driver preferences, remembered in this browser. Add new settings to DEFAULTS, with a control in the panel in index.html.
const STORE = 'geodrive_settings_v1';
export const DEFAULTS = {
  carScale: 0.9, // 1 is a real car's size
  carProfile: 'sport',
  masterVolume: 0.8,
  muted: false,
  engineVolume: 0.6,
  enginePitch: 1,
  radioVolume: 0.7,
  signalVolume: 0.5,
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE)) };
  } catch (err) {
    console.warn('settings:', err);
    return { ...DEFAULTS };
  }
}

export const settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
  } catch (err) {
    console.warn('saving settings:', err); // they still apply for this visit
  }
}
