const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = document.querySelector('[data-elevate]');
if (header) {
  const onScroll = () => {
    if (window.scrollY > 8) {
      header.classList.add('is-sticky');
    } else {
      header.classList.remove('is-sticky');
    }
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const animatedElements = document.querySelectorAll('[data-animate]');
if (!prefersReducedMotion && animatedElements.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );
  animatedElements.forEach((element, index) => {
    element.style.setProperty('--delay', `${index * 60}ms`);
    observer.observe(element);
  });
} else {
  animatedElements.forEach((element) => element.classList.add('is-visible'));
}

const navLinks = document.querySelectorAll('a[href^="#"]');
navLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const targetId = link.getAttribute('href');
    if (!targetId || targetId === '#') return;
    const target = document.querySelector(targetId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  });
});

const moduleCards = document.querySelectorAll('.module-card');
moduleCards.forEach((card, index) => {
  card.style.setProperty('--hover-delay', `${index * 40}ms`);
  card.addEventListener('mouseenter', () => card.classList.add('active'));
  card.addEventListener('mouseleave', () => card.classList.remove('active'));
});

const contactForm = document.querySelector('.contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    contactForm.classList.add('is-sent');
    const button = contactForm.querySelector('button');
    if (button) {
      button.textContent = 'Demande envoyée';
      button.setAttribute('disabled', 'true');
    }
  });
}
