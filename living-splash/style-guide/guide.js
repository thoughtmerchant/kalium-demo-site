const select = document.querySelector('#typeface');
const size = document.querySelector('#type-size');
const sample = document.querySelector('#sample-text');
const preview = document.querySelector('#live-type');
const output = document.querySelector('#type-size-value');
function updateType() {
  preview.className = 'live-specimen ' + select.value;
  preview.style.fontSize = size.value + 'px';
  preview.textContent = sample.value || 'Better choices, companies, futures.';
  output.value = size.value + ' px';
}
[select, size, sample].forEach(control => control.addEventListener('input', updateType));
updateType();
const status = document.querySelector('#color-status');
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', async () => {
  const color = button.dataset.color;
  try { await navigator.clipboard.writeText(color); status.textContent = color + ' copied.'; }
  catch { status.textContent = 'Select and copy this value: ' + color; }
}));
