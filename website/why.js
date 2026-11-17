// "Why Havana?" (Claude): cards fade up and play their icon once as they reach the screen.
// A plain scroll check (no IntersectionObserver) so it also works in headless browsers.
(() => {
  const section = document.getElementById('why');
  if (!section || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...section.querySelectorAll('.why-card')];
  if (!cards.length) return;
  section.classList.add('why-on');
  let ticking = false;
  const check = () => {
    ticking = false;
    for (const card of cards) {
      if (!card.classList.contains('is-in') && card.getBoundingClientRect().top < innerHeight * 0.9) card.classList.add('is-in');
    }
    if (cards.every((card) => card.classList.contains('is-in'))) removeEventListener('scroll', onScroll);
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(check);
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  check();
})();
