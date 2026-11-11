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

// Background: scatter trade icons across the width; each rises at its own speed. Negative delays
// mean the page opens with icons already mid-flight instead of all starting at the bottom.
(() => {
  const layer = document.querySelector('.bg-float');
  if (!layer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const icons = ['shoe', 'bag', 'chair', 'phone', 'headphones', 'shirt', 'heart', 'swap', 'cedi'];
  const colours = ['var(--brand)', 'var(--pink)', 'var(--mango)', 'var(--leaf)'];
  const count = innerWidth < 600 ? 10 : 18;
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < count; i++) {
    const item = document.createElement('span');
    item.className = 'fl';
    const size = 26 + Math.random() * 30;
    const duration = 15 + Math.random() * 12;
    Object.assign(item.style, {
      left: `${((i + Math.random()) / count) * 100}%`,
      width: `${size}px`,
      height: `${size}px`,
      color: colours[i % colours.length],
      animationDuration: `${duration}s`,
      animationDelay: `${-Math.random() * duration}s`,
    });
    const svg = document.createElementNS(ns, 'svg');
    svg.style.animationDelay = `${-Math.random() * 5}s`;
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#i-${icons[i % icons.length]}`);
    svg.append(use);
    item.append(svg);
    layer.append(item);
  }
})();
