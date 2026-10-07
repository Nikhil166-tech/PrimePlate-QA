import { navigate, getCurrentPath } from '../router';
import { openMealScanner } from './meal-scanner';
import {
  renderStudentBottomNav,
  attachStudentBottomNavEvents,
  renderProviderBottomNav,
  attachProviderBottomNavEvents,
} from './bottom-nav';

export function renderNavbar(): string {
  const token = localStorage.getItem('accessToken');
  const role = (localStorage.getItem('userRole') || 'STUDENT').toUpperCase();
  const currentPath = getCurrentPath();

  const isStudent = role === 'STUDENT';
  const isProvider = role === 'PROVIDER' || role === 'MEAL_PROVIDER';
  const isAdmin = role === 'ADMIN';

  const isWhyActive = window.location.hash.includes('why-primeplate');
  const isHomeActive = (currentPath === '/home' || currentPath === '/') && !isWhyActive;

  const navLinksHtml = `
    <a href="/home" class="nav-item-btn ${isHomeActive ? 'active' : ''}">
      <i class="fa-solid fa-house"></i> Home
    </a>
    <a href="/home#why-primeplate" class="nav-item-btn ${isWhyActive ? 'active' : ''}">
      <i class="fa-solid fa-circle-question"></i> Why Choose Us?
    </a>
    <a href="/providers" class="nav-item-btn ${currentPath.startsWith('/providers') ? 'active' : ''}">
      <i class="fa-solid fa-store"></i> Browse Mess
    </a>
    <a href="#footer" class="nav-item-btn nav-contact-btn">
      <i class="fa-solid fa-headset"></i> Contact Us
    </a>
    ${token && isStudent
      ? `<a href="/student/dashboard" class="nav-item-btn ${currentPath === '/dashboard' || currentPath === '/student/dashboard' ? 'active' : ''}">
            <i class="fa-solid fa-qrcode"></i> My Mess Card
          </a>
          <a href="/student/transactions" class="nav-item-btn ${currentPath.startsWith('/student/transactions') ? 'active' : ''}">
            <i class="fa-solid fa-receipt"></i> Transactions
          </a>`
      : ''
    }
    ${token && isProvider
      ? `<a href="/owner" class="nav-item-btn ${currentPath === '/owner' ? 'active' : ''}">
            <i class="fa-solid fa-building-user"></i> Provider Portal
          </a>`
      : ''
    }
    ${token && isAdmin
      ? `<a href="/admin" class="nav-item-btn ${currentPath === '/admin' ? 'active' : ''}">
            <i class="fa-solid fa-user-shield"></i> Admin Portal
          </a>
          <a href="/admin/earnings" class="nav-item-btn ${currentPath.startsWith('/admin/earnings') ? 'active' : ''}">
            <i class="fa-solid fa-wallet"></i> Provider Earnings
          </a>
          <a href="/admin/data-import" class="nav-item-btn ${currentPath === '/admin/data-import' ? 'active' : ''}">
            <i class="fa-solid fa-file-import"></i> Data Import
          </a>`
      : ''
    }
  `;

  const authBtnHtml = token
    ? `<button class="logoutBtnAction btn-outline-action" style="color: #dc2626; border-color: #fee2e2; background: #fef2f2;">
        <i class="fa-solid fa-right-from-bracket"></i> Sign Out
      </button>`
    : `<a href="/login" class="btn-primary-action">
        <i class="fa-solid fa-user"></i> Sign In
      </a>`;

  return `
    <nav class="navbar">
      <div class="navbar-container">
        <a href="/home" class="nav-brand">
          <img src="/primeplate-icon.svg" alt="PrimePlate" style="width: 36px; height: 36px; border-radius: 12px; display: block;" />
          <span class="nav-brand-text">PrimePlate</span>
        </a>

        <!-- Desktop Menu -->
        <div class="desktop-nav-menu" style="display: flex; align-items: center; gap: 4px;">
          ${navLinksHtml}
        </div>

        <div class="desktop-nav-menu" style="display: flex; align-items: center; gap: 12px;">
          ${authBtnHtml}
        </div>

        <!-- Mobile Action: Hamburger if Logged In, Sign In Button if Logged Out -->
        ${token
      ? `<button id="mobileNavToggleBtn" class="mobile-nav-toggle" aria-label="Toggle navigation">
                 <i class="fa-solid fa-bars" id="mobileNavToggleIcon"></i>
               </button>`
      : `<a href="/login" class="mobile-auth-btn btn-primary-action" style="padding: 7px 14px; font-size: 13px; font-weight: 700; border-radius: 10px; text-decoration: none;">
                 <i class="fa-solid fa-user"></i> Sign In
               </a>`
    }
      </div>

      <!-- Mobile Dropdown Drawer -->
      <div id="mobileMenuDrawer" class="mobile-menu-drawer">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${navLinksHtml}
        </div>
        <div style="margin-top: 8px; border-top: 1px solid var(--color-neutral-200); padding-top: 12px;">
          ${authBtnHtml}
        </div>
      </div>
    </nav>
    ${renderStudentBottomNav(currentPath)}
    ${renderProviderBottomNav(currentPath)}
  `;
}

export function attachNavbarEvents() {
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    sessionStorage.removeItem('pendingPaymentOrderId');
    sessionStorage.removeItem('pendingPaymentPlanId');
    navigate('/login');
  };

  document.querySelectorAll('.logoutBtnAction').forEach((btn) => {
    btn.addEventListener('click', handleLogout);
  });

  document.querySelectorAll('a[href*="why-primeplate"]').forEach((link) => {
    link.addEventListener('click', () => {
      const el = document.getElementById('why-primeplate');
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    });
  });

  document.querySelectorAll('.nav-contact-btn').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const footerEl = document.querySelector('.footer');
      if (footerEl) {
        footerEl.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/home');
        setTimeout(() => {
          document.querySelector('.footer')?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    });
  });

  document.querySelectorAll('.nav-scan-qr-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openMealScanner(() => {
        if (window.location.pathname.includes('/dashboard')) {
          window.location.reload();
        } else {
          navigate('/student/dashboard');
        }
      });
    });
  });

  const toggleBtn = document.getElementById('mobileNavToggleBtn');
  const drawer = document.getElementById('mobileMenuDrawer');
  const icon = document.getElementById('mobileNavToggleIcon');

  if (toggleBtn && drawer && icon) {
    if ((toggleBtn as any)._hasNavListener) {
      return;
    }
    (toggleBtn as any)._hasNavListener = true;

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = drawer.classList.contains('open');
      if (isOpen) {
        drawer.classList.remove('open');
        icon.className = 'fa-solid fa-bars';
      } else {
        drawer.classList.add('open');
        icon.className = 'fa-solid fa-xmark';
      }
    });

    drawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        drawer.classList.remove('open');
        icon.className = 'fa-solid fa-bars';
      });
    });

    document.addEventListener('click', (e) => {
      if (
        drawer.classList.contains('open') &&
        !drawer.contains(e.target as Node) &&
        !toggleBtn.contains(e.target as Node)
      ) {
        drawer.classList.remove('open');
        icon.className = 'fa-solid fa-bars';
      }
    });
  }

  attachStudentBottomNavEvents();
  attachProviderBottomNavEvents();
}
