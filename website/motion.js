/* Optional enhancement; the artwork and navigation also work without JS. */
(() => {
  const visual = document.querySelector('.hero-visual');
  if (!visual || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(([entry]) => {
    visual.querySelectorAll('.card, .stamp').forEach((element) => {
      element.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
    });
  }, { threshold: 0.05 });
  observer.observe(visual);
})();
