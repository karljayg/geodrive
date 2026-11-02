// The soundtrack: which moods exist, their songs and how they behave. Tune here and nowhere else. Files are in public/audio/music.
// A mood:
//   songs: played in turn, each with a file and a volume (0..1). Add more to a mood and it rotates through them. Empty is fine: see fallback.
//   volume: the whole mood's level (0..1), multiplied by the song's volume and the player's Music volume.
//   fade: seconds of crossfade into this mood, and between its songs.
//   overridesRadio: true plays over the radio or phone, stopping them until it ends. false waits until they're off.
//   priority: when several scenes are on, the highest plays.
//   fallback: the mood to use while this one has no songs.
// Song volumes even out loudness to about -17 LUFS, so set them by measuring (see SOURCES.md there), and use the mood's volume for taste.
const FOREBODING_SONGS = [
  { file: '5-foreboding-fragmented-motif.mp3', volume: 1 },
  { file: '5b-foreboding-fragmented-motif.mp3', volume: 0.8 },
];

export const MUSIC = {
  folder: 'audio/music/',
  moods: {
    // Follow the clock, and play only when the radio and phone are silent.
    day: { label: 'Daytime', fade: 4, volume: 1, songs: [
      { file: '1-peaceful-daytime-everyday-whimsy.mp3', volume: 0.89 },
      { file: '1b-peaceful-daytime-everyday-whimsy.mp3', volume: 0.99 },
    ] },
    afternoon: { label: 'Late afternoon', fade: 4, volume: 1, songs: [
      { file: '2-late-afternoon-warm-afternoon.mp3', volume: 0.87 },
    ] },
    dusk: { label: 'Dusk', fade: 4, volume: 1, fallback: 'afternoon', songs: [] }, // slot 3, not made yet
    night: { label: 'Night', fade: 4, volume: 1, songs: [
      { file: '4b-nighttime-after-dark.mp3', volume: 0.93 },
    ] },
    lateNight: { label: 'Late night', fade: 4, volume: 1, songs: FOREBODING_SONGS }, // uneasy, but not a scene, so the radio still wins

    // Scenes: the game asks for these with soundtrack.scene(name), and they override the radio.
    foreboding: { label: 'Foreboding', fade: 4, volume: 1, overridesRadio: true, priority: 10, songs: FOREBODING_SONGS },
    suspense: { label: 'Suspense', fade: 3, volume: 1, overridesRadio: true, priority: 20, songs: [
      { file: '6-suspense-silent-pulse.mp3', volume: 0.99 },
      { file: '6b-suspense-silent-pulse.mp3', volume: 0.93 },
    ] },
    danger: { label: 'Danger', fade: 2, volume: 1, overridesRadio: true, priority: 30, songs: [
      { file: '7b-danger-fragmented-pulse.mp3', volume: 0.95 },
    ] },
    chase: { label: 'Chase', fade: 1.5, volume: 1, overridesRadio: true, priority: 40, songs: [
      { file: '8b-chase-obsessive-pulse.mp3', volume: 0.77 },
    ] },
  },
  // The mood for each part of the game clock (settings.hour), from that hour until the next entry. The last runs past midnight to the first.
  clock: [
    { from: 4.5, mood: 'night' },
    { from: 6, mood: 'day' },
    { from: 16.5, mood: 'afternoon' },
    { from: 18.5, mood: 'dusk' },
    { from: 19.5, mood: 'night' },
    { from: 23, mood: 'lateNight' },
  ],
  sceneMinimum: 8, // seconds a scene keeps playing after it's ended, so a chase that stops and starts doesn't flip the music
  stopFade: 2.5, // seconds to fade out when the radio takes over or music stops
  radioFade: 2, // seconds to fade the radio out for a scene
  radioFadeIn: 1.5, // seconds to fade it back in once it's playing again
  radioGrace: 10, // seconds the radio has to start or recover before the soundtrack fills the silence
  songTail: 1.5, // seconds before a song's end to finish a crossfade, as most end in about that much silence
};
