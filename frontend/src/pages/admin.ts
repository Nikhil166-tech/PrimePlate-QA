import api from '../api';
import { navigate } from '../router';
import { showToast } from '../components/toast';
import { renderNavbar, attachNavbarEvents } from '../components/navbar';
import { renderFooter, attachFooterEvents } from '../components/footer';
import { escapeHtml } from '../utils/sanitize';

export async function renderAdminPortal() {
  const container = document.getElementById('app')!;
  const token = localStorage.getItem('accessToken');
  const role = (localStorage.getItem('userRole') || '').toUpperCase();

  if (!token || role !== 'ADMIN') {
    showToast('Admin authorization required', 'error');
    navigate('/login');
    return;
  }

  container.innerHTML = `
    ${renderNavbar()}
    <main class="main-content" style="padding-top: 88px; padding-bottom: 60px;">
      <div style="max-width: 1280px; margin: 0 auto; padding: 0 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <span style="font-size: 12px; font-weight: 700; color: #dc2626; background: #fee2e2; padding: 4px 12px; border-radius: 999px;">
              Admin System Control Panel
            </span>
            <h1 class="font-display" style="font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; color: var(--color-neutral-900); margin-top: 8px; margin-bottom: 4px;">Platform Admin Dashboard</h1>
            <p style="color: var(--color-neutral-600); font-size: clamp(0.875rem, 2vw, 0.95rem);">Review provider applications, approve mess listings, and monitor platform metrics</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--color-neutral-200); padding-bottom: 12px; overflow-x: auto;">
          <a href="/admin" class="btn-primary-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap; background: var(--color-primary-600);">
            <i class="fa-solid fa-shield-halved"></i> Provider Approvals
          </a>
          <a href="/admin/earnings" class="btn-outline-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap;">
            <i class="fa-solid fa-wallet"></i> Provider Earnings
          </a>
          <a href="/admin/settings" class="btn-outline-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap;">
            <i class="fa-solid fa-sliders"></i> Platform & Fee Settings
          </a>
          <a href="/admin/data-import" class="btn-outline-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap;">
            <i class="fa-solid fa-file-import"></i> Production Data Import
          </a>
        </div>

        <!-- Metrics Overview from Analytics Module -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px;">
          <div style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--color-primary-50); color: var(--color-primary-600); display: flex; align-items: center; justify-content: center; font-size: 18px;">
                <i class="fa-solid fa-users"></i>
              </div>
              <span style="color: var(--color-neutral-500); font-size: 13px;">Total Users</span>
            </div>
            <p id="metricUsers" class="font-display" style="font-size: 28px; font-weight: 800; color: var(--color-neutral-900);">--</p>
          </div>

          <div style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--color-success-50); color: var(--color-success-600); display: flex; align-items: center; justify-content: center; font-size: 18px;">
                <i class="fa-solid fa-store"></i>
              </div>
              <span style="color: var(--color-neutral-500); font-size: 13px;">Approved Messes</span>
            </div>
            <p id="metricProviders" class="font-display" style="font-size: 28px; font-weight: 800; color: var(--color-neutral-900);">--</p>
          </div>

          <div style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--color-secondary-50); color: var(--color-secondary-500); display: flex; align-items: center; justify-content: center; font-size: 18px;">
                <i class="fa-solid fa-arrow-trend-up"></i>
              </div>
              <span style="color: var(--color-neutral-500); font-size: 13px;">Total Revenue</span>
            </div>
            <p id="metricRevenue" class="font-display" style="font-size: 28px; font-weight: 800; color: var(--color-neutral-900);">--</p>
          </div>

          <div style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 18px;">
                <i class="fa-solid fa-clock"></i>
              </div>
              <span style="color: var(--color-neutral-500); font-size: 13px;">Pending Approvals</span>
            </div>
            <p id="metricPending" class="font-display" style="font-size: 28px; font-weight: 800; color: #d97706;">--</p>
          </div>
        </div>

        <!-- Pending Provider Approvals Section -->
        <div style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 24px; padding: 24px; margin-bottom: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div>
              <h2 class="font-display" style="font-size: 20px; font-weight: 700;">Pending Provider Applications</h2>
              <p style="color: var(--color-neutral-600); font-size: 13px;">Only approved providers appear in public search results.</p>
            </div>
          </div>
          <div id="pendingList" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;"></div>
        </div>
      </div>
    </main>

    ${renderFooter()}
  `;

  attachNavbarEvents();
  attachFooterEvents();

  // Load Pending Providers
  const pendingList = document.getElementById('pendingList')!;
  const loadPending = async () => {
    let pending: any[] = [];
    try {
      const data: any = await api.get('/providers/pending');
      pending = Array.isArray(data) ? data : [];
    } catch (err: any) {
      pendingList.innerHTML = `<p style="color: #dc2626; font-size: 14px;"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load pending applications: ${escapeHtml(err.message || 'Server error')}</p>`;
      return;
    }

    if (pending.length === 0) {
      pendingList.innerHTML = `<p style="color: var(--color-neutral-500); font-size: 14px;">No pending provider approvals right now.</p>`;
      return;
    }

    pendingList.innerHTML = pending
      .map(
        (p) => `
        <div style="background: var(--color-neutral-50); border: 1px solid var(--color-neutral-200); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <span style="font-size: 11px; font-weight: 700; color: #d97706; background: #fef3c7; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px;">
              PENDING APPROVAL
            </span>
            <h3 class="font-display" style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">${escapeHtml(p.name)}</h3>
            <p style="font-size: 13px; color: var(--color-neutral-600); margin-bottom: 8px;">
              <i class="fa-solid fa-location-dot"></i> ${escapeHtml(p.address || p.city || '')}
            </p>
            ${p.description ? `
              <p style="font-size: 12px; color: var(--color-neutral-700); margin-bottom: 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${escapeHtml(p.description)}
              </p>
            ` : ''}
            ${Array.isArray(p.amenities) && p.amenities.length > 0 ? `
              <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px;">
                ${p.amenities.slice(0, 5).map((a: string) => `<span style="font-size: 11px; font-weight: 600; background: #fff; border: 1px solid var(--color-neutral-200); padding: 2px 8px; border-radius: 999px; color: var(--color-neutral-700);">${escapeHtml(a)}</span>`).join('')}
                ${p.amenities.length > 5 ? `<span style="font-size: 10px; color: var(--color-neutral-500); align-self: center;">+${p.amenities.length - 5} more</span>` : ''}
              </div>
            ` : ''}
          </div>
          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button class="btn-primary-action approve-btn" data-prov-id="${escapeHtml(p.id)}" style="flex: 1; padding: 8px; font-size: 13px; background: var(--color-success-600);">
              <i class="fa-solid fa-check"></i> Approve
            </button>
            <button class="btn-outline-action reject-btn" data-prov-id="${escapeHtml(p.id)}" style="padding: 8px 16px; font-size: 13px; color: #dc2626; border-color: #fee2e2;">
              <i class="fa-solid fa-xmark"></i> Reject
            </button>
          </div>
        </div>
      `,
      )
      .join('');

    pendingList.querySelectorAll('.approve-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const pId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
        try {
          await api.patch(`/providers/approve/${pId}`);
          showToast('Provider approved successfully!', 'success');
          await loadPending();
        } catch (err: any) {
          showToast(err.message || 'Failed to approve provider', 'error');
        }
      });
    });

    pendingList.querySelectorAll('.reject-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const pId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
        try {
          await api.patch(`/providers/reject/${pId}`);
          showToast('Provider application rejected.', 'info');
          await loadPending();
        } catch (err: any) {
          showToast(err.message || 'Failed to reject provider', 'error');
        }
      });
    });
  };

  loadPending();

  // Load Analytics metrics
  try {
    const usersData: any = await api.get('/analytics/users');
    const uCount = typeof usersData === 'number' ? usersData : usersData?.totalUsers ?? 0;
    const uEl = document.getElementById('metricUsers');
    if (uEl) uEl.innerText = `${uCount}`;

    const provsData: any = await api.get('/analytics/providers');
    const pCount = typeof provsData === 'number' ? provsData : provsData?.totalProviders ?? 0;
    const pEl = document.getElementById('metricProviders');
    if (pEl) pEl.innerText = `${pCount}`;

    const revData: any = await api.get('/analytics/revenue');
    const rAmt = typeof revData === 'number' ? revData : revData?.totalRevenue ?? 0;
    const rEl = document.getElementById('metricRevenue');
    if (rEl) rEl.innerText = `₹${rAmt.toLocaleString('en-IN')}`;

    const pendData: any = await api.get('/analytics/pending-approvals');
    const pendCount = typeof pendData === 'number' ? pendData : pendData?.pendingApprovals ?? 0;
    const pendEl = document.getElementById('metricPending');
    if (pendEl) pendEl.innerText = `${pendCount}`;
  } catch (_) {}
}
