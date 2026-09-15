// Links still lead to visible notes if JavaScript is unavailable.
document.querySelectorAll('.citation-row').forEach(row => {
  const links = [...row.querySelectorAll('.citation-ref')];
  const notes = [...row.querySelectorAll('.citation-note')];
  if (!links.length) return;
  function show(id) {
    notes.forEach(note => { note.hidden = note.id !== id; });
    links.forEach(link => link.setAttribute('aria-expanded', String(link.hash === '#' + id)));
  }
  row.classList.add('citations-ready');
  show(notes.some(note => '#' + note.id === location.hash) ? location.hash.slice(1) : null);
  links.forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    show(link.getAttribute('aria-expanded') === 'true' ? null : link.hash.slice(1));
  }));
  notes.forEach(note => note.querySelector('.citation-close')?.addEventListener('click', () => {
    show(null);
    links.find(link => link.hash === '#' + note.id)?.focus();
  }));
  row.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const active = links.find(link => link.getAttribute('aria-expanded') === 'true');
    if (active) { show(null); active.focus(); }
  });
  window.addEventListener('hashchange', () => {
    if (notes.some(note => '#' + note.id === location.hash)) show(location.hash.slice(1));
  });
});
