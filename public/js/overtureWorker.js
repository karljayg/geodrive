// Reads Overture's tiles away from the game, as a tile of Manhattan holds thousands of places and would stop the walk while it's read.
import { readPlaces } from './overture.js';

self.onmessage = async ({ data: { id, bytes, x, y } }) => {
  try {
    self.postMessage({ id, places: await readPlaces(bytes, x, y) });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
