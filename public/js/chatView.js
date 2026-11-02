// The look of chat: the Enter line, and message previews styled like an iPhone's, on the dashboard in a car and rising from the phone on foot. Cards are solid, as
// backdrop-filter over the map is costly, and only move by transform and opacity. All text goes in as text. What's said is in chat.js.
import { GROUP_THREAD, MOST_CARDS, showFor, threadTitle, withCard } from './chat.js';
import { readChatLine } from './protocol.js';
import { GAME } from './gameConfig.js';

const PROBLEMS = {
  'no-name': 'Who to? /w name message',
  'no-message': 'What do you want to say? /w name message',
  'too-long': `That's over ${GAME.world.chatLength} characters.`,
  'unknown-command': 'Only /w works here: /w name message',
};
const MOST_BUBBLES = 4;
const ANSWERS = { offline: 'The world can\'t be reached right now.', 'too-fast': 'Slow down a little.', dead: 'They\'re dead.', unknown: 'There\'s nobody by that name.' };

export class ChatView {
  // world: the shared world. sound(): the new-message sound. phoneDead(): no phone, no chat. opened(on): the line opening and closing, for letting go of the keys. onCard(thread): a card was clicked.
  constructor({ world, line, previews, speechBox, spoke, sound, phoneDead, opened, canShow }) {
    Object.assign(this, { world, line, previews, speechBox, spoke, sound, phoneDead, opened, canShow });
    this.cards = [];
    this.timers = new Map();
    this.input = line.querySelector('input');
    this.hint = line.querySelector('[data-chat-hint]');
    this.isOpen = false;
    this.input.maxLength = GAME.world.chatLength + 60; // room for /w and a name
    line.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); this.finishName(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      if (e.key.length > 1 && e.key !== 'Enter') return;
      this.tell('');
    });
    previews.addEventListener('click', (e) => {
      const card = e.target.closest('[data-card]');
      if (card) card.classList.toggle('expanded');
      if (card) this.hold(card.dataset.card);
    });
  }

  names() {
    return this.world.people.others.filter((member) => member.lives > 0).map((member) => member.name);
  }

  // Enter, from the game. Speaking needs no phone.
  open() {
    this.isOpen = true;
    this.line.classList.add('open');
    this.input.value = '';
    this.tell('');
    this.opened(true);
    this.input.focus();
    return true;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.line.classList.remove('open');
    this.input.blur();
    this.opened(false);
  }

  tell(text) {
    this.hint.textContent = text;
  }

  // Tab: finishes the name being typed after /w.
  finishName() {
    const typed = this.input.value.match(/^(\/w\s+)(\S*)$/i);
    if (!typed) return;
    const found = this.names().filter((name) => name.toLowerCase().startsWith(typed[2].toLowerCase()));
    if (found.length === 1) this.input.value = `${typed[1]}${found[0]} `;
    else if (found.length) this.tell(found.join(', '));
  }

  async send() {
    const read = readChatLine(this.input.value, this.names(), GAME.world.chatLength);
    if (!read) return this.close();
    if (read.error) return this.tell(read.error === 'unknown-name' ? `There's nobody called ${read.name}.` : PROBLEMS[read.error]);
    if (read.to && this.phoneDead()) return this.tell('Your phone\'s dead.');
    const to = read.to ? this.world.people.byName(read.to)?.id : null;
    const text = this.input.value;
    this.input.value = '';
    const answer = await this.world.link.ask(to ? { t: 'say', text: read.text, to } : { t: 'speak', text: read.text });
    if (answer.why) {
      if (this.isOpen && !this.input.value) this.input.value = text; // what was typed stays
      return this.tell(ANSWERS[answer.why] ?? 'That didn\'t send.');
    }
    if (answer.offline) this.flash(`${read.to} is away, and will see it when they're back.`);
    if (!to) {
      this.speech(this.world.you.id, read.text);
      if (!answer.heard) this.speechNote('Nobody\'s close enough to hear.');
    }
    this.close();
  }

  // Said aloud, shown for a few seconds and then gone. Nothing keeps it.
  speech(from, text) {
    const bubble = document.createElement('div'), name = document.createElement('b'), words = document.createElement('p');
    bubble.className = `speechBubble${from === this.world.you.id ? ' mine' : ''}`;
    name.textContent = from === this.world.you.id ? 'You' : this.world.nameOf(from) ?? '';
    words.textContent = text;
    bubble.append(name, words);
    this.showBubble(bubble, showFor(text));
    this.spoke?.(from);
  }

  speechNote(text) {
    const bubble = document.createElement('div');
    bubble.className = 'speechBubble note';
    bubble.textContent = text;
    this.showBubble(bubble, 2500);
  }

  showBubble(bubble, ms) {
    this.speechBox.append(bubble);
    while (this.speechBox.childElementCount > MOST_BUBBLES) this.speechBox.firstElementChild.remove();
    setTimeout(() => {
      bubble.classList.add('leaving');
      setTimeout(() => bubble.remove(), 250);
    }, ms);
  }

  // One new message. It's kept whatever happens; this is only the preview, which doesn't show with the thread already open.
  said(line) {
    if (this.phoneDead() || !this.canShow(line.thread)) return;
    const mine = line.sender === this.world.you.id;
    if (!mine) this.sound();
    this.addCard({
      thread: line.thread, mine,
      title: this.titleOf(line.thread),
      from: line.thread === GROUP_THREAD && !mine ? this.world.nameOf(line.sender) : null,
      text: line.text, ms: showFor(line.text),
    });
  }

  titleOf(thread) {
    return threadTitle(thread, this.world.chat, (id) => this.world.nameOf(id), this.names());
  }

  missed(count) {
    if (this.phoneDead()) return;
    this.addCard({ thread: 'missed', title: 'Messages', text: `${count} new message${count === 1 ? '' : 's'}`, ms: 6000 });
  }

  flash(text) {
    this.addCard({ thread: 'note', title: 'Messages', text, ms: 5000 });
  }

  addCard(card) {
    this.cards = withCard(this.cards, card);
    this.render();
    clearTimeout(this.timers.get(card.thread));
    this.timers.set(card.thread, setTimeout(() => this.dismiss(card.thread), card.ms));
  }

  // Clicked open, it stays for as long as there is to read.
  hold(thread) {
    clearTimeout(this.timers.get(thread));
    this.timers.set(thread, setTimeout(() => this.dismiss(thread), 15000));
  }

  dismiss(thread) {
    const element = this.previews.querySelector(`[data-card="${CSS.escape(thread)}"]`);
    this.timers.delete(thread);
    const gone = () => {
      this.cards = this.cards.filter((card) => card.thread !== thread);
      this.render();
    };
    if (!element) return gone();
    element.classList.add('leaving');
    setTimeout(gone, 250);
  }

  render() {
    const known = new Map([...this.previews.children].map((element) => [element.dataset.card, element]));
    for (const [thread, element] of known) if (!this.cards.some((card) => card.thread === thread)) element.remove();
    for (const card of this.cards) {
      let element = known.get(card.thread);
      if (!element) {
        element = document.createElement('article');
        element.className = 'msgCard';
        element.dataset.card = card.thread;
        element.innerHTML = '<div class="msgIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#fff" d="M12 3C6.5 3 2 6.6 2 11c0 2.5 1.4 4.7 3.6 6.2-.2 1.3-.8 2.5-1.7 3.5 1.8-.2 3.5-1 4.8-2 1 .2 2.2.3 3.3.3 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg></div><div class="msgBody"><div class="msgTop"><b></b><small>now</small></div><p></p></div>';
      }
      element.classList.toggle('mine', !!card.mine);
      element.querySelector('b').textContent = card.title;
      element.querySelector('p').textContent = card.from ? `${card.from}: ${card.text}` : card.text;
      this.previews.append(element); // newest at the bottom
    }
    this.previews.classList.toggle('some', this.cards.length > 0);
  }
}

export { MOST_CARDS };
