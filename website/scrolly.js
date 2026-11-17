// "Three ways to trade" scroll story (owned by Claude).
// On wide screens the section pins while you scroll and a phone acts out each way to trade:
// 1. a card swipes right ("Want it"), 2. a card swipes up and an offer gets accepted,
// 3. two items swap places and the buyer walks to a public meeting spot.
// The three explanation cards on the right take turns as you scroll. The original markup stays as is
// for phones, no-JS and reduced motion; there each card just eases in as it reaches the screen.
(() => {
  const section = document.getElementById('how');
  if (!section) return;
  const ways = [...section.querySelectorAll('.way')];
  if (ways.length !== 3) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // The pinned story needs a screen tall enough for the phone plus a short caption; phones qualify.
  const wide = matchMedia('(min-width: 340px) and (min-height: 560px)');

  // Small screens / reduced motion: staggered entrance only.
  const entrance = () => {
    section.classList.add('ways-enter');
    const show = () => {
      for (const way of ways) {
        if (way.getBoundingClientRect().top < innerHeight * 0.88) way.classList.add('is-in');
      }
    };
    show();
    addEventListener('scroll', show, { passive: true });
  };

  if (reduce.matches || !wide.matches) {
    if (!reduce.matches) entrance();
    return;
  }

  const phone = `
    <div class="ph" aria-hidden="true">
      <div class="ph-notch"></div>
      <div class="ph-screen">
        <div class="ph-top"><b>havana<span>.</span></b><i>⌖ Osu, Ghana</i></div>

        <div class="act act-1">
          <div class="pc pc-back"><img src="assets/deck/plant.webp" alt=""></div>
          <div class="pc pc-front">
            <img src="assets/deck/sofa.webp" alt="">
            <span class="pc-price">GH₵2,500</span>
            <span class="pc-stamp pc-want">Want it</span>
            <div class="pc-body"><b>Green velvet sofa</b><small>Kaneshie · 6 km · Used · good</small></div>
          </div>
          <div class="ph-heart">♥</div>
          <div class="ph-toast">Saved to your favourites</div>
        </div>

        <div class="act act-2">
          <div class="pc pc-front pc-up">
            <img src="assets/deck/headphones.webp" alt="">
            <span class="pc-price">GH₵300</span>
            <span class="pc-stamp pc-offer">Make offer</span>
            <div class="pc-body"><b>Headphones, big sound</b><small>Madina · 8 km · Brand new</small></div>
          </div>
          <div class="ph-sheet">
            <small>Haggle a little</small>
            <div class="ph-chips"><span>Asking</span><span class="on">−10%</span><span>−20%</span><span>−30%</span></div>
            <div class="ph-offer">GH₵270</div>
          </div>
          <div class="ph-bubble ph-mine">Would you take GH₵270?</div>
          <div class="ph-bubble ph-theirs">Deal! 🎉 <em>Offer accepted</em></div>
        </div>

        <div class="act act-3">
          <div class="ph-match">It's a Havana Match!</div>
          <div class="sw sw-a"><img src="assets/deck/stool.webp" alt=""><small>Your stool</small></div>
          <div class="sw-arrows">⇄</div>
          <div class="sw sw-b"><img src="assets/deck/handbag.webp" alt=""><small>Their bag</small></div>
          <div class="ph-map">
            <span class="pin pin-a">⌖</span><span class="route"></span><span class="pin pin-b">⌖</span>
            <span class="walker"><i></i></span>
            <small>Meet somewhere public</small>
          </div>
        </div>
      </div>
    </div>`;

  // Build: track (tall, for scrolling) > pin (sticky, one screen) > stage (phone) + steps (the 3 cards).
  const title = section.querySelector('h2');
  const grid = section.querySelector('.ways');
  const track = document.createElement('div');
  track.className = 'sy-track';
  const pin = document.createElement('div');
  pin.className = 'sy-pin';
  pin.innerHTML = `
    <div class="sy-glow" aria-hidden="true"></div>
    <div class="sy-stage">${phone}</div>
    <div class="sy-steps"></div>
    <ol class="sy-dots" aria-hidden="true"><li></li><li></li><li></li></ol>`;
  const steps = pin.querySelector('.sy-steps');
  steps.append(title, grid);
  track.append(pin);
  section.append(track);
  section.classList.add('is-scrolly');

  let ticking = false;
  let lastStep = -1;
  const update = () => {
    ticking = false;
    const box = track.getBoundingClientRect();
    const span = Math.max(1, box.height - innerHeight);
    const p = Math.min(1, Math.max(0, -box.top / span));
    // Each way gets a third of the scroll; hold the last bit of each third still so it can be read.
    const step = Math.min(2, Math.floor(p * 3));
    const local = Math.min(1, (p * 3 - step) / 0.8);
    pin.style.setProperty('--p', p.toFixed(4));
    pin.style.setProperty('--t', local.toFixed(4));
    if (step !== lastStep) {
      lastStep = step;
      pin.dataset.step = String(step + 1);
      ways.forEach((way, i) => way.classList.toggle('is-active', i === step));
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  update();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  // Crossing the breakpoint or switching on reduced motion: simplest is a reload of the layout.
  const reset = () => location.reload();
  wide.addEventListener?.('change', reset);
  reduce.addEventListener?.('change', reset);
})();
