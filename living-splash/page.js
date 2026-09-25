const home = document.querySelector('.home-page');
if (home) {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let leaving = false;
  let restored = false;
  let departure;

  // Reveal only after the artwork and fonts are ready, never while leaving.
  const image = home.querySelector('.botanical-image');
  Promise.race([
    Promise.allSettled([image.decode(), document.fonts.ready]),
    new Promise(resolve => setTimeout(resolve, 4000))
  ]).then(() => {
    root.classList.remove('home-intro-pending');
    if (leaving || restored) return;
    root.classList.add('home-intro-playing');
    setTimeout(() => root.classList.remove('home-intro-playing'), 3300);
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
    root.classList.remove('home-intro-pending', 'home-intro-playing');
  });
}
