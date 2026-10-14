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
