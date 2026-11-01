// The town name out of a Google reverse-geocode answer, for the header. Pure, tested in node.
// Most specific first among the names people use for a place. A county is the last resort, for open country.
const TOWN_TYPES = ['locality', 'postal_town', 'sublocality', 'administrative_area_level_3', 'neighborhood', 'administrative_area_level_2'];

// Results run from most to least precise, so each type takes the first one that has it.
export function townFrom(results) {
  const parts = (results || []).flatMap((r) => r.address_components || []);
  const named = (type) => parts.find((p) => p.types.includes(type));
  const town = TOWN_TYPES.map(named).find(Boolean);
  if (!town) return null;
  const state = named('administrative_area_level_1');
  return state && state.short_name !== town.long_name ? `${town.long_name}, ${state.short_name}` : town.long_name;
}
