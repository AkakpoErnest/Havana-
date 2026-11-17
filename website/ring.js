/* One compositor orbit; no timers or work while hidden/offscreen. */
(() => {
  'use strict';
  const section = document.querySelector('.category-ring');
  if (!section || !window.matchMedia || !('IntersectionObserver' in window)) return;
  const orbit = section.querySelector('.ring-orbit');
  const chips = [...section.querySelectorAll('.ring-chips li')];
  const button = section.querySelector('.ring-pause');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, paused = false, frame = 0, last = 0;
  let autoAngle = 0, scrollAngle = 0, dirty = true, front = -1;
  const step = 360 / chips.length;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function schedule() {
    if (!frame && visible && !document.hidden && !reduced.matches && !paused) {
      frame = requestAnimationFrame(tick);
    }
  }
  function tick(time) {
    frame = 0;
    // Read geometry once per scroll/resize, before any visual writes.
    if (dirty) {
      const rect = section.getBoundingClientRect();
      scrollAngle = ((innerHeight - rect.top) / (innerHeight + rect.height) - .5) * -150;
      dirty = false;
    }
    if (last) autoAngle -= Math.min(time - last, 64) * .004;
    last = time;
    const angle = autoAngle + scrollAngle;
    orbit.style.transform = `rotateX(-7deg) rotateY(${angle}deg)`;
    const next = ((Math.round(-angle / step) % chips.length) + chips.length) % chips.length;
    if (next !== front) {
      if (front >= 0) chips[front].classList.remove('is-front');
      chips[next].classList.add('is-front');
      front = next;
    }
    schedule();
  }
  function preference() {
    stop();
    section.classList.toggle('ring-is-live', !reduced.matches);
    button.hidden = reduced.matches;
    if (reduced.matches) {
      orbit.style.removeProperty('transform');
      chips.forEach(chip => chip.classList.remove('is-front'));
      front = -1;
    }
    dirty = true;
    schedule();
  }
  button.addEventListener('click', () => {
    paused = !paused;
    button.textContent = paused ? 'Resume rotation' : 'Pause rotation';
    if (paused) stop(); else { dirty = true; schedule(); }
  });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    dirty = true;
    if (visible) schedule(); else stop();
  }, { threshold: 0 }).observe(section);
  window.addEventListener('scroll', () => { dirty = true; schedule(); }, { passive: true });
  window.addEventListener('resize', () => { dirty = true; schedule(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else { dirty = true; schedule(); }
  });
  if (reduced.addEventListener) reduced.addEventListener('change', preference);
  else reduced.addListener(preference);
  preference();
})();
