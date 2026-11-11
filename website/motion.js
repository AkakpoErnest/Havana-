// Hero swipe deck: every few seconds the front card shows its stamp and swipes away like in the app,
// then rejoins the back of the deck. Pauses offscreen / in a hidden tab; static with reduced motion.
(() => {
  const deck = document.querySelector('.deck');
  if (!deck) return;
  const order = [...deck.querySelectorAll('.sc')];
  const place = () => order.forEach((card, i) => { card.dataset.pos = i < 3 ? String(i) : 'hidden'; });
  place();
  deck.classList.add('is-ready');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || order.length < 2) return;
  let visible = true;
  let timer;
  let busy = false;
  const step = () => {
    if (busy) return;
    busy = true;
    const card = order[0];
    const dir = card.dataset.dir || 'right';
    card.classList.add('show-stamp');
    setTimeout(() => {
      card.classList.add(`leave-${dir}`);
      setTimeout(() => {
        // Snap the card (now invisible) to the back without animating it across the deck.
        card.classList.add('instant');
        card.classList.remove(`leave-${dir}`, 'show-stamp');
        order.push(order.shift());
        place();
        void card.offsetWidth;
        card.classList.remove('instant');
        busy = false;
      }, 600);
    }, 750);
  };
  const run = () => {
    clearInterval(timer);
    if (visible && !document.hidden) timer = setInterval(step, 2800);
  };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; run(); }, { threshold: 0.1 }).observe(deck);
  document.addEventListener('visibilitychange', run);
  run();
})();

// Background: trade icons rise behind the page, each at its own speed (negative delays mean the page
// opens with icons already mid-flight). When a new section reaches the middle of the screen, the icons
// shrink, switch to that section's set and colours, and grow back.
(() => {
  const layer = document.querySelector('.bg-float');
  if (!layer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const B = 'var(--brand)', P = 'var(--pink)', M = 'var(--mango)', L = 'var(--leaf)';
  const themes = {
    hero: { icons: ['shoe', 'bag', 'chair', 'phone', 'headphones', 'shirt', 'heart', 'swap', 'tag'], colours: [B, P, M, L] },
    how: { icons: ['heart', 'up', 'swap'], colours: [L, M, P] },
    cats: { icons: ['shirt', 'shoe', 'bag', 'chair', 'phone', 'headphones'], colours: [B, P, M] },
    why: { icons: ['pin', 'heart', 'tag', 'swap'], colours: [L, B, P] },
    sell: { icons: ['tag', 'shirt', 'chair', 'bag', 'up'], colours: [M, P, B] },
    swap: { icons: ['swap', 'heart'], colours: [P, B] },
    safety: { icons: ['shield', 'pin', 'chat'], colours: [L, B] },
    faq: { icons: ['chat', 'heart', 'pin'], colours: [B, M, P] },
    download: { icons: ['download', 'phone', 'heart'], colours: [M, P, L] },
  };
  const count = innerWidth < 600 ? 10 : 18;
  const ns = 'http://www.w3.org/2000/svg';
  const items = [];
  for (let i = 0; i < count; i++) {
    const item = document.createElement('span');
    item.className = 'fl';
    const size = 26 + Math.random() * 30;
    const duration = 15 + Math.random() * 12;
    Object.assign(item.style, {
      left: `${((i + Math.random()) / count) * 100}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDuration: `${duration}s`,
      animationDelay: `${-Math.random() * duration}s`,
    });
    const svg = document.createElementNS(ns, 'svg');
    svg.style.animationDelay = `${-Math.random() * 5}s`;
    const use = document.createElementNS(ns, 'use');
    svg.append(use);
    item.append(svg);
    layer.append(item);
    items.push({ item, svg, use });
  }
  const paint = (theme) => items.forEach(({ item, use }, i) => {
    use.setAttribute('href', `#i-${theme.icons[i % theme.icons.length]}`);
    item.style.color = theme.colours[i % theme.colours.length];
  });
  paint(themes.hero);
  let current = 'hero';
  let timer;
  const show = (name) => {
    if (name === current || !themes[name]) return;
    current = name;
    clearTimeout(timer);
    items.forEach(({ svg }) => svg.classList.add('is-switching'));
    timer = setTimeout(() => {
      paint(themes[current]);
      items.forEach(({ svg }) => svg.classList.remove('is-switching'));
    }, 280);
  };
  // The section crossing the middle of the screen is "current". Checked on scroll (once per frame).
  const sections = [...document.querySelectorAll('[data-bg]')];
  let queued = false;
  const check = () => {
    queued = false;
    const middle = innerHeight / 2;
    const hit = sections.find((el) => { const r = el.getBoundingClientRect(); return r.top <= middle && r.bottom > middle; });
    if (hit) show(hit.dataset.bg);
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  check();
})();

// Sections below the hero fade up the first time they come into view. Added from JS so the page
// still shows everything without it; checked on scroll so it works in every browser.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let waiting = [...document.querySelectorAll('main > section:not(.hero):not([hidden])')]
    .filter((section) => section.getBoundingClientRect().top >= innerHeight);
  waiting.forEach((section) => section.classList.add('rv'));
  let queued = false;
  const check = () => {
    queued = false;
    waiting = waiting.filter((section) => {
      if (section.getBoundingClientRect().top > innerHeight * 0.88) return true;
      section.classList.add('is-in');
      return false;
    });
    if (!waiting.length) removeEventListener('scroll', onScroll);
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
  addEventListener('scroll', onScroll, { passive: true });
})();
