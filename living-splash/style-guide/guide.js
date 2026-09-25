const status = document.querySelector('#color-status');
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', async () => {
  const color = button.dataset.color;
  try { await navigator.clipboard.writeText(color); status.textContent = color + ' copied.'; }
  catch { status.textContent = 'Select and copy this value: ' + color; }
}));

const strategy = document.querySelector('.strategy-viewer');
if (strategy) {
  const base = new URL('../assets/brand-strategy/', document.baseURI);
  fetch(new URL('slides.json', base)).then(response => {
    if (!response.ok) throw new Error('Slides unavailable');
    return response.json();
  }).then(slides => {
    let current = 0;
    const image = strategy.querySelector('#strategy-image');
    const fullSize = strategy.querySelector('.strategy-slide');
    const strip = strategy.querySelector('.strategy-thumbnails');
    const previous = strategy.querySelector('[data-strategy-step="-1"]');
    const next = strategy.querySelector('[data-strategy-step="1"]');
    const choose = (index, reveal = true) => {
      current = Math.max(0, Math.min(slides.length - 1, index));
      const slide = slides[current];
      image.src = new URL(slide.image, base).href;
      image.alt = `Slide ${slide.number}: ${slide.title}`;
      fullSize.href = image.src;
      strategy.querySelector('#strategy-count').textContent = `${String(slide.number).padStart(2, '0')} / ${slides.length}`;
      strategy.querySelector('#strategy-slide-title').textContent = slide.title;
      strategy.querySelector('#strategy-text').textContent = slide.text || slide.title;
      previous.disabled = current === 0;
      next.disabled = current === slides.length - 1;
      [...strip.children].forEach((button, i) => button.setAttribute('aria-current', String(i === current)));
      if (reveal) {
        const thumb = strip.children[current];
        const thumbBox = thumb.getBoundingClientRect();
        const stripBox = strip.getBoundingClientRect();
        if (thumbBox.left < stripBox.left || thumbBox.right > stripBox.right) {
          strip.scrollTo({left: strip.scrollLeft + thumbBox.left - stripBox.left - strip.clientWidth / 2 + thumb.offsetWidth / 2, behavior: 'auto'});
        }
      }
    };
    slides.forEach((slide, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Slide ${slide.number}: ${slide.title}`);
      const thumbnail = document.createElement('img');
      thumbnail.src = new URL(slide.thumbnail, base).href;
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      thumbnail.width = 320;
      thumbnail.height = 180;
      button.append(thumbnail, String(slide.number).padStart(2, '0'));
      button.addEventListener('click', () => choose(index));
      strip.append(button);
    });
    previous.addEventListener('click', () => choose(current - 1));
    next.addEventListener('click', () => choose(current + 1));
    strategy.addEventListener('keydown', event => {
      if (event.target.closest('details') || event.altKey || event.ctrlKey || event.metaKey) return;
      const targets = {ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1};
      if (event.key in targets) {event.preventDefault(); choose(targets[event.key]);}
    });
    choose(0, false);
  }).catch(() => {
    strategy.querySelector('#strategy-slide-title').textContent = 'Download the PDF to view the complete deck.';
    strategy.querySelectorAll('[data-strategy-step]').forEach(button => {button.disabled = true;});
  });
}
