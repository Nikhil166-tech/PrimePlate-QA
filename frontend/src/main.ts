import './style.css';
import {
  initRouter,
  registerRoute,
  navigate,
  getCurrentPath,
  getPathSegments,
} from './router';
import { renderHome } from './pages/home';
import { renderLogin } from './pages/login';
import { renderProviders } from './pages/providers';
import { renderProviderDetail } from './pages/provider-detail';
import { renderCheckout } from './pages/checkout';
import { renderDashboard } from './pages/dashboard';
import { renderOwnerPortal } from './pages/owner';
import { renderAdminPortal } from './pages/admin';
import { renderAdminEarnings } from './pages/admin-earnings';
import { renderAdminSettings } from './pages/admin-settings';
import { renderAdminDataImport } from './pages/admin-data-import';
import { renderForgotPassword } from './pages/forgot-password';
import { renderResetPassword } from './pages/reset-password';
import { renderTransactions } from './pages/transactions';
import { inject } from '@vercel/analytics';

// Initialize Vercel Web Analytics
inject();

// Auth & Role guard
function requireRole(allowedRoles: string[], callback: () => void) {
  const token = localStorage.getItem('accessToken');
  const role = (localStorage.getItem('userRole') || 'STUDENT').toUpperCase();

  if (!token) {
    // Save target route so visitor returns directly after login/register
    const currentPath = getCurrentPath();
    if (currentPath && currentPath !== '/login') {
      localStorage.setItem('redirectAfterAuth', currentPath);
    }
    navigate('/login');
    return;
  }

  if (allowedRoles.includes(role)) {
    callback();
  } else {
    // Redirect based on role if attempting to access forbidden route
    if (role === 'ADMIN') {
      navigate('/admin');
    } else if (role === 'PROVIDER' || role === 'MEAL_PROVIDER') {
      navigate('/owner');
    } else {
      navigate('/student/dashboard');
    }
  }
}

// Register clean production routes
registerRoute('/home', renderHome);
registerRoute('/login', renderLogin);
registerRoute('/forgot-password', renderForgotPassword);
registerRoute('/reset-password', renderResetPassword);
registerRoute('/providers', renderProviders);
registerRoute('/dashboard', () => requireRole(['STUDENT'], renderDashboard));
registerRoute('/student/dashboard', () =>
  requireRole(['STUDENT'], renderDashboard),
);
registerRoute('/student/transactions', () =>
  requireRole(['STUDENT'], renderTransactions),
);
registerRoute('/student/transactions/:orderId', () =>
  requireRole(['STUDENT'], renderTransactions),
);
registerRoute('/owner', () =>
  requireRole(['PROVIDER', 'MEAL_PROVIDER'], renderOwnerPortal),
);
registerRoute('/admin', () => requireRole(['ADMIN'], renderAdminPortal));
registerRoute('/admin/earnings', () =>
  requireRole(['ADMIN'], renderAdminEarnings),
);
registerRoute('/admin/earnings/:providerId', () => {
  const parts = getPathSegments();
  const providerId = parts[2];
  requireRole(['ADMIN'], () => renderAdminEarnings(providerId));
});
registerRoute('/admin/settings', () =>
  requireRole(['ADMIN'], renderAdminSettings),
);
registerRoute('/admin/data-import', () =>
  requireRole(['ADMIN'], renderAdminDataImport),
);
registerRoute('/providers/:id', () => {
  const parts = getPathSegments();
  const id = parts[1];
  renderProviderDetail(id);
});
registerRoute('/checkout/:planId', () => {
  const parts = getPathSegments();
  const planId = parts[1];
  requireRole(['STUDENT'], () => renderCheckout(planId));
});

// Initialize router
initRouter();
