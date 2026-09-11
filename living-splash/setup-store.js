export async function loadSetup() {
  const response = await fetch(new URL('./motion-setup.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error('The motion setup could not load.');
  return { setup: await response.json(), revision: 'client-preview' };
}
