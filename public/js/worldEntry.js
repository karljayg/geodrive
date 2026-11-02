// How a page gets into a world, before any map loads, so none of this costs a map load: following an invite, choosing from this browser's worlds, or making one.
// Only loaded when there's a world to think about, so a browser that has never seen one doesn't load the network code at all.
import { GAME } from './gameConfig.js';
import { LOOK_PARTS, NAME_MOST, PROTOCOL, nameProblem } from './protocol.js';
import { WorldLink } from './net.js';
import { knownWorlds, rememberWorld, savedMe } from './world.js';

const box = () => document.getElementById('worldEntry');
const DEFAULT_COLOURS = { skin: '#d1a685', jacket: '#f27f14', jeans: '#213357', shoes: '#1a1717', hair: '#241a12' };
const PART_NAMES = { skin: 'Skin', jacket: 'Jacket', jeans: 'Jeans', shoes: 'Shoes', hair: 'Hair' };

const NAME_TROUBLE = {
  'too-short': 'A name needs at least 2 characters.',
  'too-long': `A name can have at most ${NAME_MOST} characters.`,
  'bad-characters': 'A name can only have letters, digits, - and _, with no spaces.',
  'name-taken': 'Someone in this world has had that name, and a name is only used once. Choose another.',
  'bad-look': 'Those colours didn\'t work. Choose them again.',
};
const REFUSED = {
  'invite-used': ['This invite has been used or has run out', 'Invites work once and last a day. Ask whoever runs that world for a new one.'],
  'full': ['That world is full right now', `${GAME.world.playersOnline} people are playing. Try again when someone has left.`],
  'unknown': ['This browser can\'t sign in to that world', 'It no longer has this person\'s sign-in. Ask whoever runs that world for a rejoin invite.'],
  'dead': ['That person is dead', 'They\'re gone for good. Ask whoever runs that world to invite you as someone new.'],
  'no-world': ['That world isn\'t here', 'It may have been removed.'],
  'old-client': ['GeoDrive has been updated', 'Refresh this page to carry on.'],
  'too-many-worlds': ['That\'s enough new worlds for today', 'Try again tomorrow.'],
  'server-full': ['There\'s no room for new worlds right now', 'Try again later.'],
};

function show(html) {
  const root = box();
  root.innerHTML = `<div class="startBox">${html}</div>`;
  root.classList.add('open');
  return root;
}

function hide() {
  box().classList.remove('open');
  box().innerHTML = '';
}

// A message with buttons, resolving with the chosen one's id.
function ask(title, text, buttons) {
  return new Promise((resolve) => {
    const root = show('<h1></h1><p></p><div class="row"></div>');
    root.querySelector('h1').textContent = title;
    root.querySelector('p').textContent = text;
    buttons.forEach(([id, label], i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = i === 0 ? 'primary' : 'quiet';
      button.textContent = label;
      button.addEventListener('click', () => { hide(); resolve(id); });
      root.querySelector('.row').append(button);
    });
    root.querySelector('button').focus();
  });
}

// A little drawing of the person, in the chosen colours.
const figureDrawing = `<svg class="lookFigure" viewBox="0 0 80 150" aria-hidden="true">
  <rect data-part="jeans" x="27" y="82" width="11" height="50" rx="4"/><rect data-part="jeans" x="42" y="82" width="11" height="50" rx="4"/>
  <rect data-part="shoes" x="23" y="130" width="16" height="9" rx="3"/><rect data-part="shoes" x="41" y="130" width="16" height="9" rx="3"/>
  <rect data-part="jacket" x="14" y="42" width="9" height="40" rx="4"/><rect data-part="jacket" x="57" y="42" width="9" height="40" rx="4"/>
  <rect data-part="jacket" x="24" y="38" width="32" height="48" rx="7"/>
  <circle data-part="skin" cx="18.5" cy="85" r="4.5"/><circle data-part="skin" cx="61.5" cy="85" r="4.5"/>
  <rect data-part="skin" x="35" y="30" width="10" height="10"/>
  <rect data-part="hair" data-long x="24" y="10" width="32" height="42" rx="11"/>
  <circle data-part="skin" cx="40" cy="20" r="13"/>
  <path data-part="hair" d="M26 19a14 14 0 0 1 28 0c-5-5-23-5-28 0z"/>
</svg>`;

// Name, male or female, and colours. worldName: ask for the world's name too. check(values): resolves with null if it worked, or a message, leaving this up to try again.
function lookForm({ title, intro, worldName, button, check }) {
  return new Promise((resolve) => {
    const root = show(`<h1></h1><p></p><form class="lookForm">
      ${worldName ? '<label>World\'s name<input data-world type="text" maxlength="40" autocomplete="off"></label>' : ''}
      <label>Your name<input data-name type="text" maxlength="${NAME_MOST}" autocomplete="off" spellcheck="false"></label>
      <div class="lookChoice"><label><input type="radio" name="figure" value="male" checked> Male</label><label><input type="radio" name="figure" value="female"> Female</label></div>
      <div class="lookParts"><div class="lookColours">${LOOK_PARTS.map((part) => `<label>${PART_NAMES[part]}<input type="color" data-colour="${part}" value="${DEFAULT_COLOURS[part]}"></label>`).join('')}</div>${figureDrawing}</div>
      <div class="lookStatus" role="status"></div>
      <div class="row"><button class="primary" type="submit"></button><button class="quiet" type="button" data-cancel>Cancel</button></div>
    </form>`);
    root.querySelector('h1').textContent = title;
    root.querySelector('p').textContent = intro;
    root.querySelector('button[type=submit]').textContent = button;
    const status = root.querySelector('.lookStatus'), nameBox = root.querySelector('[data-name]'), worldBox = root.querySelector('[data-world]'), form = root.querySelector('form');
    const look = () => ({ figure: form.elements.figure.value, colours: Object.fromEntries(LOOK_PARTS.map((part) => [part, root.querySelector(`[data-colour="${part}"]`).value])) });
    const paint = () => {
      const { figure, colours } = look();
      for (const part of LOOK_PARTS) for (const shape of root.querySelectorAll(`.lookFigure [data-part="${part}"]`)) shape.setAttribute('fill', colours[part]);
      root.querySelector('[data-long]').style.display = figure === 'female' ? '' : 'none';
    };
    paint();
    form.addEventListener('input', paint);
    nameBox.addEventListener('input', () => { status.textContent = nameBox.value ? NAME_TROUBLE[nameProblem(nameBox.value)] ?? '' : ''; });
    root.querySelector('[data-cancel]').addEventListener('click', () => { hide(); resolve(null); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problem = nameProblem(nameBox.value);
      if (problem) { status.textContent = NAME_TROUBLE[problem]; return nameBox.focus(); }
      if (worldBox && !worldBox.value.trim()) { status.textContent = 'Give the world a name.'; return worldBox.focus(); }
      status.textContent = 'One moment…';
      const trouble = await check({ name: nameBox.value, worldName: worldBox?.value.trim(), ...look() });
      if (trouble) { status.textContent = trouble; return nameBox.focus(); }
      hide();
      resolve(true);
    });
    (worldBox ?? nameBox).focus();
  });
}

const noMoreRetries = (why) => REFUSED[why] ?? ['That didn\'t work', why];

// Signs in with what this browser has saved. { link, welcome }, or null to go to the sandbox instead.
async function signIn(storage, id) {
  const me = savedMe(storage, id), hello = { t: 'hello', protocol: PROTOCOL, world: id, player: me?.id, secret: me?.secret };
  for (;;) {
    const link = new WorldLink({});
    let answer;
    try {
      answer = await link.open(hello);
    } catch (err) {
      if ((await ask('Can\'t reach the world', 'The world server isn\'t answering. Your things are safe there.', [['retry', 'Try again'], ['sandbox', 'Play in my sandbox']])) === 'retry') continue;
      return null;
    }
    if (answer.t === 'welcome') return { link, welcome: answer };
    link.close();
    if (answer.why === 'old-client') {
      await ask(...noMoreRetries(answer.why), [['refresh', 'Refresh']]);
      location.reload();
      return new Promise(() => {});
    }
    const [title, text] = noMoreRetries(answer.why);
    const buttons = answer.why === 'full' ? [['retry', 'Try again'], ['sandbox', 'Play in my sandbox']] : [['sandbox', 'Play in my sandbox']];
    if ((await ask(title, text, buttons)) === 'retry') continue;
    return null;
  }
}

// Follows an invite: the dialog, then in. { link, welcome }, or null to go to the sandbox instead.
async function followInvite(storage, id, code) {
  let entered = null, link = null;
  const done = await lookForm({
    title: 'You\'ve been invited to a shared world',
    intro: 'What happens there stays, for everyone in it. Choose who you\'ll be: your name can\'t be changed afterwards.',
    button: 'Join',
    check: async ({ name, figure, colours }) => {
      const message = { t: 'join', protocol: PROTOCOL, world: id, code, name, figure, colours };
      let answer;
      try {
        if (link?.connected) answer = await link.say(message);
        else {
          link = new WorldLink({});
          answer = await link.open(message);
        }
      } catch (err) {
        link = null;
        return 'The world server isn\'t answering. Try again in a moment.';
      }
      if (answer.t === 'welcome') {
        rememberWorld(storage, { id, name: answer.world.name, me: { id: answer.you.id, secret: answer.you.secret } });
        entered = { link, welcome: answer };
        return null;
      }
      if (NAME_TROUBLE[answer.why]) return NAME_TROUBLE[answer.why];
      const [title, text] = noMoreRetries(answer.why);
      return `${title}. ${text}`;
    },
  });
  if (!done) link?.close();
  return done ? entered : null;
}

function choose(worlds) {
  return new Promise((resolve) => {
    const root = show('<h1>Where do you want to play?</h1><div class="worldList"></div>');
    const list = root.querySelector('.worldList');
    const add = (value, label, small) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'worldChoice';
      const b = document.createElement('b'), s = document.createElement('small');
      b.textContent = label;
      s.textContent = small;
      button.append(b, s);
      button.addEventListener('click', () => { hide(); resolve(value); });
      list.append(button);
    };
    for (const world of worlds) add(world.id, world.name, 'Shared world');
    add(null, 'My sandbox', 'Just you, in this browser');
    list.querySelector('button').focus();
  });
}

// Which world this page opens: { kind: 'sandbox' }, or { kind: 'private', id, link, welcome }. Changes the address to say which, so a refresh comes back here.
export async function chooseWorld({ storage, where = location }) {
  const params = new URLSearchParams(where.search), invite = where.hash.match(/^#w=([\w-]+)\.([\w-]+)/);
  const sandbox = () => {
    if (!params.has('sandbox') && knownWorlds(storage).length) history.replaceState(null, '', `${where.pathname}?sandbox=1`);
    return { kind: 'sandbox' };
  };
  const into = (id, entered) => {
    if (!entered) return sandbox();
    history.replaceState(null, '', `${where.pathname}?w=${encodeURIComponent(id)}`);
    return { kind: 'private', id, ...entered };
  };
  if (invite) {
    const [, id, code] = invite;
    history.replaceState(null, '', where.pathname);
    return into(id, savedMe(storage, id) ? await signIn(storage, id) : await followInvite(storage, id, code));
  }
  const asked = params.get('w');
  if (asked) return into(asked, await signIn(storage, asked));
  if (params.has('sandbox') || params.has('world')) return { kind: 'sandbox' };
  const worlds = knownWorlds(storage);
  if (!worlds.length) return { kind: 'sandbox' };
  const picked = await choose(worlds);
  return picked ? into(picked, await signIn(storage, picked)) : sandbox();
}

// Makes a new world, from the sandbox: the dialog, then a reload into it. Resolves only if they cancelled.
export async function createWorld(storage, where = location) {
  let made = null;
  const done = await lookForm({
    title: 'Make a shared world',
    intro: 'A new world, starting empty, that you can invite friends to. Your sandbox stays as it is. What happens in a world stays for everyone in it.',
    worldName: true,
    button: 'Make it',
    check: async ({ name, worldName, figure, colours }) => {
      const link = new WorldLink({ onMessage: (message) => { if (message.t === 'made') made = message; } });
      let answer;
      try {
        answer = await link.open({ t: 'create', protocol: PROTOCOL, name: worldName, player: { name, figure, colours } });
      } catch (err) {
        return 'The world server isn\'t answering. Try again in a moment.';
      }
      link.close();
      if (answer.t === 'welcome' && made) {
        rememberWorld(storage, { id: made.world, name: answer.world.name, me: { id: made.id, secret: made.secret } });
        return null;
      }
      return NAME_TROUBLE[answer.why] ?? noMoreRetries(answer.why).join('. ');
    },
  });
  if (!done || !made) return false;
  where.assign(`${where.pathname}?w=${encodeURIComponent(made.world)}`);
  return true;
}
