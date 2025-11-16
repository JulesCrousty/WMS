import { login, saveSession, getStoredSession } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-animate]').forEach((node) => {
    requestAnimationFrame(() => node.classList.add('is-visible'));
  });
  const existingSession = getStoredSession();
  if (existingSession?.token && existingSession?.user) {
    window.location.href = '/app/#/hub';
    return;
  }

  const form = document.getElementById('loginForm');
  const errorElement = document.getElementById('loginError');

  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.classList.remove('shake');
    errorElement.textContent = '';
    form.querySelector('button')?.setAttribute('disabled', 'true');
    const data = new FormData(form);
    try {
      const session = await login(data.get('username'), data.get('password'));
      saveSession(session);
      window.location.href = '/app/#/hub';
    } catch (error) {
      errorElement.textContent = error.message || 'Connexion impossible';
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 600);
    } finally {
      form.querySelector('button')?.removeAttribute('disabled');
    }
  });
});
