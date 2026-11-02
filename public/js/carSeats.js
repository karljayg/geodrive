// A little car from above, with a badge in each seat: the driver front left, then the rest. Text and colours were checked by the server. Pure, tested in node.
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SEATS = [[20, 38], [38, 38], [20, 66], [38, 66]];

// people: the driver or null, then those riding: { id, name, initials, colour }. Returns the panel's insides.
export function seatsPicture(colour, people) {
  const badges = people.slice(0, SEATS.length).map((person, i) => {
    const [x, y] = SEATS[i];
    return person ? `<g class="seatBadge" data-seat="${esc(person.id)}"><circle cx="${x}" cy="${y}" r="8.5" fill="${esc(person.colour)}"/><text x="${x}" y="${y + 3}" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">${esc(person.initials)}</text></g>` : '';
  }).join('');
  const empties = SEATS.map(([x, y], i) => (people[i] ? '' : `<circle cx="${x}" cy="${y}" r="7" fill="#00000040"/>`)).join('');
  const names = people.flatMap((person, i) => (person ? [`<li>${esc(person.name)}${i === 0 ? ' <small>driving</small>' : ''}</li>`] : []));
  return `<svg viewBox="0 0 58 96" aria-hidden="true"><rect x="6" y="4" width="46" height="88" rx="13" fill="${esc(colour)}"/><path d="M12 28 q17-8 34 0 v6 h-34z" fill="#0d1621b0"/><path d="M13 78 q16 6 32 0 v-3 h-32z" fill="#0d1621b0"/>${empties}${badges}</svg><ul>${names.join('') || '<li><small>Nobody at the wheel</small></li>'}</ul>`;
}
