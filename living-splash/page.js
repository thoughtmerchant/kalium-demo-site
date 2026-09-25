const home = document.querySelector('.home-page');
if (home) {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let leaving = false;
  let restored = false;
  let departure;
  let introComplete = false;
  function finishIntro() {
    root.classList.remove('home-intro-pending', 'home-intro-playing');
    if (introComplete) return;
    introComplete = true;
    window.dispatchEvent(new Event('kalium:intro-complete'));
  }
  home.querySelector('.home-details').addEventListener('animationend', event => {
    if (event.animationName === 'home-copy-focus-in') finishIntro();
  });

  // Reveal only after the artwork and fonts are ready, never while leaving.
  const image = home.querySelector('.botanical-image');
  Promise.race([
    Promise.allSettled([image.decode(), document.fonts.ready]),
    new Promise(resolve => setTimeout(resolve, 4000))
  ]).then(() => {
    if (leaving || restored || reducedMotion.matches) { finishIntro(); return; }
    // Switch states together, preserving opacity until the first animation frame.
    root.classList.add('home-intro-playing');
    root.classList.remove('home-intro-pending');
    // Fallback for browsers that suppress animationend in background tabs.
    setTimeout(finishIntro, 6000);
  });

  home.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const target = new URL(link.href);
    if (target.origin !== location.origin || !['http:', 'https:'].includes(target.protocol) || (target.pathname === location.pathname && target.search === location.search)) return;
    if (reducedMotion.matches) return;
    event.preventDefault();
    if (leaving) return;
    leaving = true;
    // Animate the parent so an unfinished entrance cannot override the exit.
    departure = home.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 180,
      easing: 'ease-out',
      fill: 'forwards'
    });
    departure.finished.then(() => {
      if (leaving) window.location.assign(target.href);
    }).catch(() => {});
  });

  // A cached Back navigation must not restore the faded-out homepage.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    restored = true;
    leaving = false;
    departure?.cancel();
    finishIntro();
  });
}
