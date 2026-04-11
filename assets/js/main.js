/* ================================================================
   ReclaimX — main.js
   Global utilities: toast, scroll effects, animations, validation
   ================================================================ */

// ── API base URL (must be defined FIRST before getToken uses it) ───
window.API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:5000'
  : 'https://YOUR-RAILWAY-URL.up.railway.app'; // ← replace after deploy

// ── Auto-refresh Firebase token before API calls ───────────────
window.getToken = async function() {
  try {
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");

    const API_BASE = window.API_BASE;

    // Only fetch config if Firebase not yet initialized
    let app;
    if (getApps().length) {
      app = getApps()[0];
    } else {
      try {
        const r = await fetch(`${API_BASE}/api/config/firebase`);
        const config = await r.json();
        app = initializeApp(config);
      } catch(e) {
        return sessionStorage.getItem('rx_token');
      }
    }

    const auth = getAuth(app);
    if (auth.currentUser) {
      const freshToken = await auth.currentUser.getIdToken(true);
      sessionStorage.setItem('rx_token', freshToken);
      return freshToken;
    }
  } catch(e) {
    console.warn('[getToken] failed:', e.message);
  }
  return sessionStorage.getItem('rx_token');
};

window.ReclaimX = window.ReclaimX || {};

// ── Toast System ───────────────────────────────────────────────
window.ReclaimX.toast = function(message, type, duration) {
  type     = type     || 'success';
  duration = duration || 4000;

  const container = document.getElementById('toastContainer');
  if (!container) return;

  const ICONS = { success: '✓', error: '✕', warning: '!', info: 'i' };

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span style="width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0;margin-top:1px;
      background:${type === 'success' ? 'var(--accent-dim)' : type === 'error' ? 'rgba(255,77,109,0.15)' : type === 'warning' ? 'rgba(251,191,36,0.15)' : 'var(--violet-dim)'};
      color:${type === 'success' ? 'var(--accent)' : type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--violet)'}"
    >${ICONS[type] || '✓'}</span>
    <span>${message}</span>
    <button class="toast-close" aria-label="Dismiss">×</button>
  `;

  container.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => dismiss(toast));

  let timer = setTimeout(() => dismiss(toast), duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', () => { timer = setTimeout(() => dismiss(toast), 1500); });

  function dismiss(el) {
    el.style.animation = 'none';
    el.style.opacity   = '0';
    el.style.transform = 'translateX(60px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }
};

// ── Navbar scroll effect (public pages) ───────────────────────
const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// ── Auto active nav link (sidebar) ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    if (link.dataset.page === current) link.classList.add('active');
  });
});

// ── Scroll-triggered animations ───────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity    = '1';
      entry.target.style.transform  = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.item-card, .card, .stat-card').forEach(el => {
  el.style.opacity   = '0';
  el.style.transform = 'translateY(16px)';
  el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  observer.observe(el);
});

// ── Relative time formatter ───────────────────────────────────
window.ReclaimX.timeAgo = function(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}hr ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// ── Sensitive data detector ───────────────────────────────────
const SENSITIVE_PATTERNS = [
  /\b\d{12}\b/,               // Aadhaar
  /\b\d{16}\b/,               // ATM / card
  /\b[A-Z]{5}\d{4}[A-Z]\b/,  // PAN
  /\b[A-Z]{3}\d{7}\b/,       // Voter ID
  /\b\d{10}\b/                // Phone
];

window.ReclaimX.hasSensitiveData = function(text) {
  if (!text) return false;
  return SENSITIVE_PATTERNS.some(p => p.test(text));
};

// ── Disposable email checker ──────────────────────────────────
const BLOCKED_DOMAINS = ['mailinator.com','guerrillamail.com','tempmail.com','10minutemail.com','yopmail.com'];
window.ReclaimX.isDisposableEmail = function(email) {
  const domain = (email || '').split('@')[1] || '';
  return BLOCKED_DOMAINS.includes(domain.toLowerCase());
};

// API base URL already defined at top

console.log('[ReclaimX] main.js loaded · API:', window.API_BASE);

// ── Sidebar Initialization ─────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('appSidebar');
  if (!sidebar || sidebar.dataset.initialized) return;
  sidebar.dataset.initialized = 'true';

  const current = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === current);
  });

  const stored = JSON.parse(sessionStorage.getItem('rx_user') || 'null');
  if (stored) {
    const name = stored.name || stored.email || 'User';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
    const trust = stored.trust_score || 0;
    const level = trust >= 100 ? '🥇 Gold Hero' : trust >= 50 ? '🥈 Silver Helper' : '🥉 Bronze Helper';

    const avatarEl = document.getElementById('sidebarAvatar');
    if (stored.photo && avatarEl) {
      avatarEl.innerHTML = `<img src="${stored.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" referrerpolicy="no-referrer"/>`;
    } else if (avatarEl) {
      avatarEl.textContent = initials;
    }
    const nameEl = document.getElementById('sidebarName');
    if (nameEl) nameEl.textContent = name;
    const lvlEl = document.getElementById('sidebarLevel');
    if (lvlEl) lvlEl.textContent = level;

    const token = sessionStorage.getItem('rx_token');
    if (token) {
      fetch(`${window.API_BASE}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          if (data.name && nameEl) nameEl.textContent = data.name;
          const liveScore = data.trust_score || 0;
          if (lvlEl) lvlEl.textContent = liveScore >= 100 ? '🥇 Gold Hero' : liveScore >= 50 ? '🥈 Silver Helper' : '🥉 Bronze Helper';
        }).catch(() => {});
    }
  }

  const logoutBtn = document.getElementById('sidebarLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.clear();
      window.location.href = 'login.html';
    });
  }

  const closeBtn = document.getElementById('sidebarClose');
  if (closeBtn) {
    if (window.innerWidth <= 900) closeBtn.style.display = 'block';
    window.addEventListener('resize', () => { closeBtn.style.display = window.innerWidth <= 900 ? 'block' : 'none'; });
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebar.style.display = '';
    });
  }

  document.addEventListener('click', (e) => {
    if (window.innerWidth > 900) return;
    const menuBtn = document.getElementById('menuBtn');
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && menuBtn && !menuBtn.contains(e.target)) {
      sidebar.classList.remove('open');
      sidebar.style.display = '';
    }
  });
}

// Observe DOM for sidebar injection
const sidebarObserver = new MutationObserver(() => {
  if (document.getElementById('appSidebar')) initSidebar();
});
sidebarObserver.observe(document.body, { childList: true, subtree: true });
