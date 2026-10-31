// Trip statistics. Pure, no DOM, so test/physics.test.mjs can run it. Time only passes in updateTrip,
// which the game loop doesn't call while paused, so pauses never count.
const MILE = 1609.344, MPS_TO_MPH = 2.23694;

export const newTrip = () => ({
  elapsed: 0, moving: 0, meters: 0, fsdMeters: 0, offRoadMeters: 0, fsdSeconds: 0,
  topSpeed: 0, bridges: 0, takeovers: 0, signals: 0, onBridge: false,
});

// state: { speed (m/s), fsd, onRoad, onBridge }. The clock starts at the first movement, not at page load.
export function updateTrip(trip, dt, meters, state) {
  const moved = Math.abs(meters);
  if (!trip.elapsed && !moved) return;
  trip.elapsed += dt;
  if (moved) trip.moving += dt;
  trip.meters += moved;
  if (state.fsd) {
    trip.fsdMeters += moved;
    trip.fsdSeconds += dt;
  }
  if (!state.onRoad) trip.offRoadMeters += moved;
  trip.topSpeed = Math.max(trip.topSpeed, Math.abs(state.speed));
  if (state.onBridge && !trip.onBridge) trip.bridges++;
  trip.onBridge = state.onBridge;
}

export function formatTime(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

// Everything worth showing, as display strings. Average speed is over time spent moving, not stopped.
export function tripFigures(trip) {
  const miles = (m) => (m / MILE).toFixed(2) + ' mi';
  const share = (part) => (trip.meters ? Math.round((part / trip.meters) * 100) : 0) + '%';
  return {
    elapsed: formatTime(trip.elapsed),
    moving: formatTime(trip.moving),
    miles: miles(trip.meters),
    average: Math.round(trip.moving ? (trip.meters / trip.moving) * MPS_TO_MPH : 0) + ' mph',
    top: Math.round(trip.topSpeed * MPS_TO_MPH) + ' mph',
    fsdMiles: miles(trip.fsdMeters),
    fsdShare: share(trip.fsdMeters),
    fsdTime: formatTime(trip.fsdSeconds),
    takeovers: String(trip.takeovers),
    signals: String(trip.signals),
    bridges: String(trip.bridges),
    offRoad: miles(trip.offRoadMeters),
  };
}
