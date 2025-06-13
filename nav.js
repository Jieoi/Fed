// nav.js

document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.sidebar-toggle');
  const menu   = document.getElementById('mobile-menu');
  const close  = document.getElementById('mobile-menu-close');
  if (!burger || !menu || !close) return;

  // Open the off-canvas menu
  burger.addEventListener('click', () => {
    menu.classList.add('show');
    menu.setAttribute('aria-hidden', 'false');
  });

  // Close via the × button
  close.addEventListener('click', () => {
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
  });

  // Close if you click on the backdrop
  menu.addEventListener('click', e => {
    if (e.target === menu) {
      menu.classList.remove('show');
      menu.setAttribute('aria-hidden', 'true');
    }
  });
});
