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
  engineSound: 'recorded', // or 'synth'
  audioPreset: 'balanced', // quiet, balanced or sport; sound only
  roadVolume: 0.5,
  windVolume: 0.5,
  roadFollow: true,
  carColor: '#0dbf8c',
  hour: 12, // time of day, 0..24
  headlights: false,
  mapQuality: 'PERFORMANCE', // or 'FIDELITY': Google's 3D map detail
  mapMemory: 512, // MB the 3D map may keep
  radioOn: true,
  radioStation: { id: 'a4d806b2-8d6a-4cd1-9000-3224e106a0bb', name: 'HOT 995 - WIHT-FM 99.5 Washington', url: 'https://stream.revma.ihrhls.com/zc2509', band: 'FM', frequency: 99.5, local: true },
};

// Defaults for new players, tuned by the owner: data/defaults.json overrides the built-in values above.
if (typeof window !== 'undefined') {
  try {
    const res = await fetch('data/defaults.json');
    if (res.ok) Object.assign(DEFAULTS, await res.json());
  } catch (err) {
    console.warn('defaults:', err);
  }
}

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
