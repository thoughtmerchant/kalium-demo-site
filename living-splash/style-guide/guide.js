const status = document.querySelector('#color-status');
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', async () => {
  const color = button.dataset.color;
  try { await navigator.clipboard.writeText(color); status.textContent = color + ' copied.'; }
  catch { status.textContent = 'Select and copy this value: ' + color; }
}));
