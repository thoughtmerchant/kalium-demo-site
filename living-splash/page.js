const dialog = document.querySelector('#placeholder-dialog');
for (const link of document.querySelectorAll('[data-placeholder]')) link.addEventListener('click', () => {
  document.querySelector('#placeholder-title').textContent = link.dataset.placeholder;
  dialog.showModal();
});
document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
import('./sculpture.js').catch(error => { console.error('Sculpture unavailable', error); document.querySelector('#sculpture-hint').textContent = 'Emergence'; });
