// ===== Navbar scroll effect =====
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ===== Mobile menu toggle =====
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
});

// Close menu on link click
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
    });
});

// ===== Smooth scroll for anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// ===== Pedido de demo: se guarda en CoreDental y nos llega el aviso =====
const contactForm = document.getElementById('contactForm');
const formError = document.getElementById('formError');

contactForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    formError.textContent = '';
    const data = Object.fromEntries(new FormData(this).entries());
    if (!data.nombre.trim() || !data.email.trim() || data.telefono.replace(/\D/g, '').length < 8) {
        formError.textContent = 'Completá tu nombre, un email y un celular con característica.';
        return;
    }
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Enviando…';
    submitBtn.disabled = true;
    try {
        const r = await fetch('https://app.coredental.com.ar/api/publico/interesados', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...data, producto: 'dental', telefono: '+54 ' + data.telefono, origen: location.href })
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.error || 'No se pudo enviar');
        this.hidden = true;
        document.getElementById('formOk').hidden = false;
    } catch (err) {
        formError.textContent = (err && err.message && err.message !== 'Failed to fetch') ? err.message : 'No se pudo enviar. Escribinos a soporte@prexacode.com';
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

document.getElementById('anio').textContent = new Date().getFullYear();

// ===== Intersection Observer for fade-up animations =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

// Animate elements on scroll
document.querySelectorAll('.feature-block, .benefit-card, .pricing-card, .faq-item').forEach(el => {
    el.classList.add('fade-up');
    observer.observe(el);
});
