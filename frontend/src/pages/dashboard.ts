import api, {
  getMyMealHistory,
  getMyRecoveryBalance,
} from '../api';
import { openMealScanner } from '../components/meal-scanner';
import { navigate } from '../router';
import { showToast } from '../components/toast';
import { renderNavbar, attachNavbarEvents } from '../components/navbar';
import { renderFooter, attachFooterEvents } from '../components/footer';
import { escapeHtml } from '../utils/sanitize';
import { mountMealCalendar } from '../components/MealCalendar';

interface SubscriptionRecord {
  id?: string;
  amountPaid?: number | string | null;
  payment?: { amount?: number | string | null };
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  paymentStatus?: string | null;
  paymentDate?: string | null;
  student?: { id?: string; name?: string; email?: string; phone?: string };
  mealPlan?: {
    id?: string;
    title?: string;
    durationDays?: number;
    mealType?: string;
    pricePerMonth?: number | string | null;
    provider?: {
      id?: string;
      name?: string;
      city?: string;
      address?: string;
      contactPhone?: string;
      mealRecoveryEnabled?: boolean;
    };
  };
  provider?: {
    id?: string;
    name?: string;
    city?: string;
    address?: string;
    contactPhone?: string;
    mealRecoveryEnabled?: boolean;
  };
  status?: string;
  startDate?: string;
  endDate?: string;
  recoveryDaysApplied?: number;
  createdAt?: string;
}

export async function renderDashboard() {
  const container = document.getElementById('app')!;
  const token = localStorage.getItem('accessToken');
  const userEmail = localStorage.getItem('userEmail') || 'PrimeMate';
  const userName = localStorage.getItem('userName') || userEmail.split('@')[0];
  const userPhone = localStorage.getItem('userPhone') || 'Not available';

  if (!token) {
    navigate('/login');
    return;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const tabParam = searchParams.get('tab');
  let activeTab: 'PASSES' | 'HISTORY' | 'MEAL_HISTORY' =
    tabParam === 'passes' || tabParam === 'active-passes'
      ? 'PASSES'
      : tabParam === 'history'
        ? 'HISTORY'
        : 'MEAL_HISTORY';
  let loadedSubs: any[] = [];
  let loadedMealHistory: any[] = [];
  let loadedRecoveryBalances: any[] = [];
  let calendarUnmountFns: (() => void)[] = [];
  let selectedSubForDetails: any = null;
  const todayStr = new Date().toISOString().split('T')[0];

  const cleanupCalendars = () => {
    calendarUnmountFns.forEach((unmount) => {
      try {
        unmount();
      } catch (_) { }
    });
    calendarUnmountFns = [];
  };

  const renderPage = () => {
    cleanupCalendars();
    container.innerHTML = `
      ${renderNavbar()}
      <main class="main-content" style="padding-top: 88px; padding-bottom: 60px; background: #f8fafc;">
        <div style="max-width: 1280px; margin: 0 auto; padding: 0 16px;">
          
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
            <div>
              <h1 class="font-display" style="font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; color: var(--color-neutral-900); margin-bottom: 4px;">PrimeMate Dashboard</h1>
              <p style="color: var(--color-neutral-600); font-size: clamp(0.875rem, 2vw, 0.95rem);">Welcome back, <strong>${escapeHtml(userName)}</strong> 👋 • Phone: <strong>${escapeHtml(userPhone)}</strong> (${escapeHtml(userEmail)})</p>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button id="dashScanQrBtn" class="btn-primary-action" style="padding: 10px 20px; background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-700)); font-weight: 700; box-shadow: 0 4px 14px rgba(234, 88, 12, 0.25);">
                <i class="fa-solid fa-camera"></i> Scan Meal QR
              </button>
              <button id="dashNewSubBtn" class="btn-outline-action" style="padding: 10px 20px; background: #fff;">
                <i class="fa-solid fa-plus"></i> New Subscription
              </button>
            </div>
          </div>

          <!-- Tab Navigation Bar -->
          <div style="display: flex; gap: 12px; margin-bottom: 24px; border-bottom: 2px solid var(--color-neutral-200); padding-bottom: 12px; overflow-x: auto;">
            <button id="tabActivePasses" class="btn-outline-action" style="font-weight: 700; padding: 10px 20px; border-radius: 12px; background: ${activeTab === 'PASSES' ? 'var(--color-primary-600)' : '#fff'}; color: ${activeTab === 'PASSES' ? '#fff' : 'var(--color-neutral-700)'}; border-color: ${activeTab === 'PASSES' ? 'var(--color-primary-600)' : 'var(--color-neutral-300)'};">
              <i class="fa-solid fa-qrcode"></i> My Active Passes
            </button>
            <button id="tabMealChecklist" class="btn-outline-action" style="font-weight: 700; padding: 10px 20px; border-radius: 12px; background: ${activeTab === 'MEAL_HISTORY' ? 'var(--color-primary-600)' : '#fff'}; color: ${activeTab === 'MEAL_HISTORY' ? '#fff' : 'var(--color-neutral-700)'}; border-color: ${activeTab === 'MEAL_HISTORY' ? 'var(--color-primary-600)' : 'var(--color-neutral-300)'};">
              <i class="fa-solid fa-calendar-check"></i> My Meal History
            </button>
            <button id="tabSubHistory" class="btn-outline-action" style="font-weight: 700; padding: 10px 20px; border-radius: 12px; background: ${activeTab === 'HISTORY' ? 'var(--color-primary-600)' : '#fff'}; color: ${activeTab === 'HISTORY' ? '#fff' : 'var(--color-neutral-700)'}; border-color: ${activeTab === 'HISTORY' ? 'var(--color-primary-600)' : 'var(--color-neutral-300)'};">
              <i class="fa-solid fa-clock-rotate-left"></i> Subscription History
            </button>
          </div>

          <!-- 3-Metrics Overview Grid: ONLY IN MEAL HISTORY TAB (Square Cards in Same Line on Mobile) -->
          ${activeTab === 'MEAL_HISTORY' ? `
            <div class="dashboard-metrics-grid student-metrics-squares">
              <div id="metricActivePassCard" class="dashboard-metric-card active-pass metric-square-card" style="cursor: pointer;" title="Click to view Active Mess Cards">
                <div class="dashboard-metric-icon">
                  <i class="fa-solid fa-id-card"></i>
                </div>
                <div class="metric-square-content">
                  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span class="dashboard-metric-label">Active Pass</span>
                    <i class="fa-solid fa-arrow-right" style="font-size: 9px; color: #16a34a; opacity: 0.8;"></i>
                  </div>
                  <p id="activeCardsCount" class="dashboard-metric-value">0</p>
                </div>
              </div>

              <div class="dashboard-metric-card total-spent metric-square-card">
                <div class="dashboard-metric-icon">
                  <i class="fa-solid fa-indian-rupee-sign"></i>
                </div>
                <div class="metric-square-content">
                  <span class="dashboard-metric-label">Total Spent</span>
                  <p id="totalSpentAmount" class="dashboard-metric-value">--</p>
                </div>
              </div>

              <div id="metricTotalSubsCard" class="dashboard-metric-card total-subs metric-square-card" style="cursor: pointer;" title="Click to view Subscription History">
                <div class="dashboard-metric-icon">
                  <i class="fa-solid fa-utensils"></i>
                </div>
                <div class="metric-square-content">
                  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span class="dashboard-metric-label">Subscriptions</span>
                    <i class="fa-solid fa-arrow-right" style="font-size: 9px; color: #0284c7; opacity: 0.8;"></i>
                  </div>
                  <p id="totalSubsCount" class="dashboard-metric-value">0</p>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Main Grid Display -->
          <div id="subsGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
            <div style="grid-column: 1/-1; text-align: center; padding: 48px;">
              <i class="fa-solid fa-spinner fa-spin" style="font-size: 28px; color: var(--color-primary-600);"></i>
              <p style="margin-top: 12px; color: var(--color-neutral-600);">Loading subscription data...</p>
            </div>
          </div>
        </div>
      </main>

      <!-- View Details Modal -->
      <div id="subDetailsModal" style="display: ${selectedSubForDetails ? 'flex' : 'none'}; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 2500; padding: 16px;">
        ${selectedSubForDetails ? `
          <div style="background: #fff; border-radius: 24px; max-width: 520px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3); max-height: 90vh; overflow-y: auto; border: 1px solid var(--color-neutral-200); position: relative;">
            
            <!-- Modal Header -->
            <div style="padding: 20px 24px; border-bottom: 1px solid var(--color-neutral-200); display: flex; justify-content: space-between; align-items: center; background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);">
              <div>
                <span style="font-size: 11px; font-weight: 800; color: var(--color-primary-600); text-transform: uppercase; letter-spacing: 0.5px;">Subscription Overview</span>
                <h3 class="font-display" style="font-size: 19px; font-weight: 800; color: var(--color-neutral-900); margin: 2px 0 0 0;">
                  ${escapeHtml(selectedSubForDetails.planType)}
                </h3>
              </div>
              <button id="closeDetailsModalBtn" style="background: #f1f5f9; border: none; font-size: 18px; width: 34px; height: 34px; border-radius: 50%; cursor: pointer; color: var(--color-neutral-600); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">&times;</button>
            </div>

            <div style="padding: 24px; display: flex; flex-direction: column; gap: 16px; font-size: 13.5px;">
              
              <!-- Provider Block -->
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 44px; height: 44px; border-radius: 12px; background: #ffedd5; color: #ea580c; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; border: 1px solid #fed7aa;">
                    <i class="fa-solid fa-utensils"></i>
                  </div>
                  <div>
                    <h4 style="font-size: 15px; font-weight: 800; color: var(--color-neutral-900); margin: 0 0 2px 0;">${escapeHtml(selectedSubForDetails.messName)}</h4>
                    <p style="font-size: 12px; color: var(--color-neutral-500); margin: 0; display: flex; align-items: center; gap: 4px;">
                      <i class="fa-solid fa-location-dot" style="color: var(--color-primary-600); font-size: 11px;"></i>
                      <span>${escapeHtml(selectedSubForDetails.area)}${selectedSubForDetails.city ? ', ' + escapeHtml(selectedSubForDetails.city) : ''}</span>
                    </p>
                  </div>
                </div>
                ${selectedSubForDetails.contact_phone ? `
                  <a href="tel:${escapeHtml(selectedSubForDetails.contact_phone)}" class="btn-outline-action" style="padding: 6px 12px; font-size: 12px; font-weight: 700; border-radius: 8px; text-decoration: none; background: #fff; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-phone"></i> Call Mess
                  </a>
                ` : ''}
              </div>

              <!-- Key Metrics 2x2 Grid -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px;">
                  <span style="font-size: 11px; color: var(--color-neutral-400); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 2px;">Amount Paid</span>
                  <strong style="font-family: var(--font-display); font-size: 18px; font-weight: 800; color: var(--color-primary-600);">${escapeHtml(selectedSubForDetails.amountPaidDisplay)}</strong>
                </div>
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px;">
                  <span style="font-size: 11px; color: var(--color-neutral-400); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Status</span>
                  <span style="font-size: 11.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; ${selectedSubForDetails.status === 'ACTIVE'
          ? 'background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;'
          : selectedSubForDetails.status === 'CANCELLED'
            ? 'background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;'
            : 'background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;'
        } display: inline-flex; align-items: center; gap: 4px;">
                    ${selectedSubForDetails.status === 'ACTIVE' ? '<span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span> Active' : selectedSubForDetails.status}
                  </span>
                </div>
              </div>

              <!-- Detailed Info List -->
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--color-neutral-500); font-size: 12.5px;">Meal Coverage:</span>
                  <span style="font-weight: 700; color: var(--color-neutral-900); font-size: 12.5px;">
                    ${selectedSubForDetails.mealType === 'LUNCH_ONLY' ? 'Lunch Only (Lunch)' : selectedSubForDetails.mealType === 'DINNER_ONLY' ? 'Dinner Only (Dinner)' : 'Full Day (All Meals)'}
                  </span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--color-neutral-500); font-size: 12.5px;">Payment Status:</span>
                  <span style="font-weight: 700; color: ${selectedSubForDetails.paymentStatus === 'PAID' ? '#15803d' : '#dc2626'}; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid ${selectedSubForDetails.paymentStatus === 'PAID' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${escapeHtml(selectedSubForDetails.paymentStatus)}
                  </span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--color-neutral-500); font-size: 12.5px;">Payment Date:</span>
                  <span style="font-weight: 600; color: var(--color-neutral-800); font-size: 12.5px;">${escapeHtml(selectedSubForDetails.paymentDateFormatted)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--color-neutral-500); font-size: 12.5px;">Validity Period:</span>
                  <span style="font-weight: 700; color: var(--color-neutral-900); font-size: 12.5px;">${escapeHtml(selectedSubForDetails.startDate)} → ${escapeHtml(selectedSubForDetails.endDate || 'Active')}</span>
                </div>
                ${selectedSubForDetails.recoveryDaysApplied > 0 ? `
                  <div style="display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; padding: 6px 10px; border-radius: 8px; border: 1px dashed #a7f3d0;">
                    <span style="color: #166534; font-size: 12px; font-weight: 700;">Meal Recovery Applied:</span>
                    <span style="font-weight: 800; color: #15803d; font-size: 12px;">+${selectedSubForDetails.recoveryDaysApplied} Extra Days</span>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
                  <span style="color: var(--color-neutral-500); font-size: 12px;">Order / Reference:</span>
                  <code style="font-size: 11px; background: #e2e8f0; padding: 2px 6px; border-radius: 6px; color: var(--color-neutral-800);">${escapeHtml(selectedSubForDetails.safeRef)}</code>
                </div>
              </div>

              <!-- Action Buttons Inside Modal -->
              <div style="display: flex; gap: 10px; margin-top: 4px; flex-wrap: wrap;">
                ${selectedSubForDetails.providerId ? `
                  <button id="modalVisitKitchenBtn" class="btn-outline-action" data-prov-id="${escapeHtml(selectedSubForDetails.providerId)}" style="flex: 1; min-width: 130px; padding: 11px; justify-content: center; font-size: 13px; font-weight: 700; background: #fff; border-radius: 12px;">
                    <i class="fa-solid fa-utensils"></i> Kitchen Menu
                  </button>
                ` : ''}
                ${selectedSubForDetails.status === 'ACTIVE' ? `
                  <button id="modalViewPassBtn" class="btn-primary-action" style="flex: 1; min-width: 140px; padding: 11px; justify-content: center; font-size: 13px; font-weight: 700; border-radius: 12px;">
                    <i class="fa-solid fa-qrcode"></i> View Mess Card
                  </button>
                ` : `
                  <button id="modalRenewSubBtn" class="btn-primary-action" data-plan-id="${escapeHtml(selectedSubForDetails.planId)}" data-prov-id="${escapeHtml(selectedSubForDetails.providerId)}" style="flex: 1; min-width: 140px; padding: 11px; justify-content: center; font-size: 13px; font-weight: 700; border-radius: 12px;">
                    <i class="fa-solid fa-rotate-right"></i> Renew Plan
                  </button>
                `}
                <button id="closeDetailsModalBtn2" class="btn-outline-action" style="width: 100%; padding: 10px; justify-content: center; font-size: 12.5px; border-radius: 10px; background: #fff; color: var(--color-neutral-600);">
                  Close
                </button>
              </div>

            </div>
          </div>
        ` : ''}
      </div>

      </div>

      ${renderFooter()}
    `;

    attachNavbarEvents();
    attachFooterEvents();

    document.getElementById('dashNewSubBtn')?.addEventListener('click', () => navigate('/providers'));

    document.getElementById('dashScanQrBtn')?.addEventListener('click', () => {
      openMealScanner(async () => {
        await fetchSubs();
      });
    });

    document.getElementById('tabActivePasses')?.addEventListener('click', () => {
      activeTab = 'PASSES';
      renderPage();
      updateContentDisplay();
    });

    document.getElementById('tabMealChecklist')?.addEventListener('click', () => {
      activeTab = 'MEAL_HISTORY';
      renderPage();
      updateContentDisplay();
    });

    document.getElementById('tabSubHistory')?.addEventListener('click', () => {
      activeTab = 'HISTORY';
      renderPage();
      updateContentDisplay();
    });

    document.getElementById('metricActivePassCard')?.addEventListener('click', () => {
      activeTab = 'PASSES';
      renderPage();
      updateContentDisplay();
    });

    document.getElementById('metricTotalSubsCard')?.addEventListener('click', () => {
      activeTab = 'HISTORY';
      renderPage();
      updateContentDisplay();
    });

    const closeModal = () => {
      selectedSubForDetails = null;
      renderPage();
      updateContentDisplay();
    };

    document.getElementById('closeDetailsModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('closeDetailsModalBtn2')?.addEventListener('click', closeModal);
  };

  const updateContentDisplay = () => {
    const subsGrid = document.getElementById('subsGrid');
    if (!subsGrid) return;

    // Cleanly unmount previously mounted React calendars to avoid leaks
    cleanupCalendars();

    const subs = loadedSubs;
    const activeSubs = subs.filter((s) => {
      const isStatusActive = (s.status || '').toUpperCase() === 'ACTIVE' && (s.paymentStatus || 'PAID').toUpperCase() === 'PAID';
      if (!isStatusActive) return false;
      if (s.daysLeft !== undefined && s.daysLeft <= 0) return false;
      if (s.endDate && s.endDate < todayStr) return false;
      return true;
    });
    const validPaidSubs = subs.filter((s) => s.parsedPaid !== null && s.paymentStatus === 'PAID');
    const totalSpent = validPaidSubs.reduce((sum, s) => sum + (s.parsedPaid ?? 0), 0);

    const activeCardsEl = document.getElementById('activeCardsCount');
    if (activeCardsEl) activeCardsEl.innerText = `${activeSubs.length}`;

    const totalSpentEl = document.getElementById('totalSpentAmount');
    if (totalSpentEl) {
      totalSpentEl.innerText = `₹${totalSpent.toLocaleString('en-IN')}`;
    }

    const totalSubsEl = document.getElementById('totalSubsCount');
    if (totalSubsEl) totalSubsEl.innerText = `${subs.length}`;



    const activeBalances = loadedRecoveryBalances.filter((b: any) => (b.remainingDays || 0) > 0);

    const renderActiveRecoveryBanners = () => {
      if (activeBalances.length === 0) return '';
      return `
        <div class="active-recoveries-container" style="grid-column: 1/-1; display: flex; flex-direction: column; gap: 12px; margin-top: 14px;">
          ${activeBalances.map((b: any) => `
            <div class="active-recovery-banner" style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 16px; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 8px rgba(34, 197, 94, 0.04);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <strong style="font-size: 15.5px; font-weight: 800; color: #111827; word-break: break-word; line-height: 1.3;">${escapeHtml(b.providerName)}</strong>
                <span style="background: #15803d; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 999px; white-space: nowrap;">
                  ${b.remainingDays} Day${b.remainingDays === 1 ? '' : 's'}
                </span>
              </div>
              <p style="font-size: 13px; color: #047857; margin: 0; line-height: 1.4; display: flex; align-items: center; gap: 6px; font-weight: 500;">
                <i class="fa-solid fa-circle-check" style="color: #22c55e;"></i> Automatically extends your next subscription
              </p>
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; font-weight: 500; margin-top: 4px; padding-top: 6px; border-top: 1px dashed #bbf7d0;">
                <span>Total: ${b.totalRecoveredDays || b.remainingDays}d</span>
                <span>Used: ${b.usedDays || 0}d</span>
              </div>
              <button class="use-recovery-plan-btn btn-primary-action" data-prov-id="${escapeHtml(b.providerId)}" style="margin-top: 6px; padding: 10px 14px; font-size: 13px; font-weight: 700; background: #15803d; border-color: #15803d; width: 100%; justify-content: center; cursor: pointer; border-radius: 10px;">
                Use on your next plan →
              </button>
            </div>
          `).join('')}
        </div>
      `;
    };

    if (activeTab === 'PASSES') {
      if (activeSubs.length === 0) {
        subsGrid.innerHTML = `
          <div style="grid-column: 1/-1; background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 24px; padding: 60px; text-align: center;">
            <div style="width: 72px; height: 72px; border-radius: 999px; background: var(--color-neutral-100); display: flex; align-items: center; justify-content: center; font-size: 32px; color: var(--color-neutral-400); margin: 0 auto 16px;">
              <i class="fa-solid fa-qrcode"></i>
            </div>
            <h3 class="font-display" style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">No active mess cards yet</h3>
            <p style="color: var(--color-neutral-500); margin-bottom: 24px; max-width: 440px; margin-left: auto; margin-right: auto;">You haven't subscribed to any mess yet. Browse hostels and PGs near you and get your first digital mess card.</p>
            <button id="emptyBrowseBtn" class="btn-primary-action">
              <i class="fa-solid fa-utensils"></i> Browse Mess
            </button>
          </div>
          ${renderActiveRecoveryBanners()}`;
        document.getElementById('emptyBrowseBtn')?.addEventListener('click', () => navigate('/providers'));
        subsGrid.querySelectorAll('.use-recovery-plan-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const pId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
            if (pId) navigate(`/providers/${pId}`);
          });
        });
        return;
      }

      subsGrid.innerHTML = activeSubs
        .map((s) => {
          const isFullDay = (s.mealType || 'FULL_DAY') === 'FULL_DAY';
          const isRecoveryEnabled = (s as any).mealRecoveryEnabled !== false;
          const mealTypeLabel = s.mealType === 'LUNCH_ONLY'
            ? 'Lunch Only (Lunch)'
            : s.mealType === 'DINNER_ONLY'
              ? 'Dinner Only (Dinner)'
              : 'Full Day (All Meals)';

          const recoveryBadgeHtml = isFullDay && isRecoveryEnabled
            ? (s.recoveryDaysApplied > 0
              ? `
                <div style="background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #166534;">
                      <i class="fa-solid fa-gift"></i> Meal Recovery Applied
                    </span>
                    <span style="font-size: 11px; font-weight: 800; color: #15803d; background: #dcfce7; padding: 2px 8px; border-radius: 999px;">
                      +${s.recoveryDaysApplied} Days
                    </span>
                  </div>
                  <div style="font-size: 13px; font-weight: 700; color: #15803d;">
                    ${s.durationDays}-day plan + ${s.recoveryDaysApplied} recovery days = ${s.durationDays + s.recoveryDaysApplied} meal days
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 11px; color: #166534; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #bbf7d0;">
                    <span>Recovery used: <strong>${s.recoveryDaysApplied} days</strong></span>
                    <span>Remaining: <strong>0 days</strong></span>
                  </div>
                </div>
              `
              : `
                <div style="font-size: 11px; color: var(--color-neutral-600); background: var(--color-neutral-50); border: 1px dashed var(--color-neutral-200); border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                  <i class="fa-solid fa-clock-rotate-left" style="color: var(--color-primary-600);"></i>
                  <span><strong>Meal Recovery:</strong> Your eligible missed meal days will be calculated after your subscription period ends.</span>
                </div>
              `)
            : '';

          return `
          <div style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 24px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
            <div style="background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-700)); padding: 24px; color: #fff;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <div>
                  <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.85;">MessCard</p>
                  <h3 class="font-display" style="font-size: 20px; font-weight: 800; color: #fff;">${escapeHtml(s.messName)}</h3>
                  <p style="font-size: 12px; opacity: 0.85; margin-top: 4px;">
                    <i class="fa-solid fa-location-dot"></i> ${escapeHtml(s.area)}${s.city ? ', ' + escapeHtml(s.city) : ''}
                  </p>
                </div>
                <div style="background: rgba(255,255,255,0.95); padding: 8px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                  <i class="fa-solid fa-qrcode" style="font-size: 36px; color: var(--color-neutral-900);"></i>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="opacity: 0.8;">Subscriber</span>
                  <span style="font-weight: 600;">${escapeHtml(s.subscriber_name)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="opacity: 0.8;">Plan</span>
                  <span style="font-weight: 600;">${escapeHtml(s.planType)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="opacity: 0.8;">Meal Option</span>
                  <span style="font-weight: 700; color: #fed7aa;">${escapeHtml(mealTypeLabel)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="opacity: 0.8;">Status</span>
                  <span style="font-weight: 700; color: #86efac;">${escapeHtml(s.status)}</span>
                </div>
              </div>
            </div>

            <div style="padding: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--color-neutral-600); margin-bottom: 8px;">
                <span>Amount Paid:</span>
                <span style="font-weight: 700; color: var(--color-neutral-900);">${escapeHtml(s.amountPaidDisplay)}</span>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--color-neutral-600); margin-bottom: 12px;">
                <span>Valid Period:</span>
                <span style="font-weight: 600; color: var(--color-neutral-900);">${escapeHtml(s.startDate)} ${s.endDate ? 'to ' + escapeHtml(s.endDate) : ''}</span>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--color-neutral-600); margin-bottom: 12px;">
                <span>Remaining Days:</span>
                <span style="font-weight: 700; color: var(--color-primary-600);">${s.daysLeft} Days</span>
              </div>

              ${recoveryBadgeHtml}

              <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn-outline-action view-kitchen-btn" data-prov-id="${escapeHtml(s.providerId)}" style="flex: 1; padding: 10px; font-size: 13px;">
                  <i class="fa-solid fa-store"></i> View Kitchen
                </button>
                <button class="btn-primary-action renew-plan-btn" data-plan-id="${escapeHtml(s.planId || '')}" data-prov-id="${escapeHtml(s.providerId || '')}" style="flex: 1; padding: 10px; font-size: 13px; justify-content: center;">
                  <i class="fa-solid fa-arrows-rotate"></i> Renew Plan
                </button>
              </div>
            </div>
          </div>
        `;
        }).join('') + renderActiveRecoveryBanners();

      subsGrid.querySelectorAll('.use-recovery-plan-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const pId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
          if (pId) navigate(`/providers/${pId}`);
        });
      });

      subsGrid.querySelectorAll('.view-kitchen-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const pId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
          if (pId) navigate(`/providers/${pId}`);
        });
      });

      subsGrid.querySelectorAll('.renew-plan-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const planId = (e.currentTarget as HTMLElement).getAttribute('data-plan-id');
          const provId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
          if (planId) {
            navigate(`/checkout/${planId}`);
          } else if (provId) {
            navigate(`/providers/${provId}`);
          }
        });
      });
    } else if (activeTab === 'MEAL_HISTORY') {
      if (loadedMealHistory.length === 0) {
        subsGrid.innerHTML = `
          <div style="grid-column: 1/-1; background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 40px 20px; text-align: center;">
            <div style="width: 56px; height: 56px; border-radius: 999px; background: var(--color-primary-50); color: var(--color-primary-600); display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 12px;">
              <i class="fa-solid fa-calendar-check"></i>
            </div>
            <h3 class="font-display" style="font-size: 19px; font-weight: 700; margin-bottom: 6px;">No Meal History Yet</h3>
            <p style="color: var(--color-neutral-500); margin-bottom: 20px; max-width: 380px; margin-left: auto; margin-right: auto; font-size: 13px;">
              Once you subscribe to a mess and scan their QR code at mealtime, your daily attendance checklist will appear here.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <button id="historyScanQrBtn" class="btn-primary-action" style="padding: 8px 16px; font-size: 13px;">
                <i class="fa-solid fa-camera"></i> Scan Meal QR
              </button>
              <button id="mealHistBrowseBtn" class="btn-outline-action" style="background: #fff; padding: 8px 16px; font-size: 13px;">
                <i class="fa-solid fa-utensils"></i> Browse Mess
              </button>
            </div>
          </div>`;
        document.getElementById('mealHistBrowseBtn')?.addEventListener('click', () => navigate('/providers'));
        document.getElementById('historyScanQrBtn')?.addEventListener('click', () => {
          openMealScanner(async () => {
            await fetchSubs();
          });
        });
        return;
      }

      subsGrid.innerHTML = loadedMealHistory
        .map((subHist) => {
          const days = subHist.days || [];
          const usedDaysCount = subHist.totalUsedCount ?? days.filter((d: any) => d.status === 'USED').length;

          const matchingSub = loadedSubs.find((s) => s.id === subHist.subscriptionId);
          const isSubExpired = matchingSub
            ? (matchingSub.status === 'EXPIRED' || matchingSub.status === 'CANCELLED')
            : (subHist.status === 'EXPIRED' || subHist.status === 'CANCELLED' || (subHist.endDate && subHist.endDate < todayStr));

          return `
            <div class="meal-history-subscription-card" style="grid-column: 1/-1; background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.03); margin-bottom: 16px; box-sizing: border-box;">
              <!-- Compact Subscription Header -->
              <div class="meal-history-sub-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--color-neutral-100); padding-bottom: 12px;">
                <div style="min-width: 0;">
                  <div style="display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-primary-700); background: var(--color-primary-50); padding: 2px 8px; border-radius: 999px; margin-bottom: 4px;">
                    <i class="fa-solid fa-utensils"></i> ${escapeHtml(subHist.planTitle)}
                  </div>
                  <h2 class="font-display" style="font-size: 17px; font-weight: 800; color: var(--color-neutral-900); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(subHist.providerName)}
                  </h2>
                  ${subHist.providerArea ? `
                    <p style="font-size: 11.5px; color: var(--color-neutral-500); margin: 2px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      <i class="fa-solid fa-location-dot" style="color: var(--color-primary-600); font-size: 10px;"></i> ${escapeHtml(subHist.providerArea)}
                    </p>
                  ` : ''}
                </div>

                <div class="meal-history-sub-actions" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <div style="background: var(--color-neutral-50); border: 1px solid var(--color-neutral-200); border-radius: 10px; padding: 5px 10px; text-align: center; display: inline-flex; align-items: center; gap: 5px;">
                    <span style="font-size: 11px; color: var(--color-neutral-500); font-weight: 600;">Checked in:</span>
                    <strong style="font-size: 13px; color: var(--color-primary-700);">${usedDaysCount} Days</strong>
                  </div>
                  ${!isSubExpired ? `
                    <button class="open-scanner-sub-btn btn-primary-action" style="padding: 7px 13px; font-size: 12px; font-weight: 700; border-radius: 10px;">
                      <i class="fa-solid fa-camera"></i> Scan Meal
                    </button>
                  ` : `
                    <span style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; display: inline-flex; align-items: center; gap: 4px;">
                      <i class="fa-solid fa-clock-rotate-left"></i> Expired
                    </span>
                  `}
                </div>
              </div>

              <!-- Calendar Section (Active Only) vs Expired Summary -->
              ${!isSubExpired ? `
                <div id="meal-calendar-mount-${escapeHtml(subHist.subscriptionId)}" class="meal-calendar-mount-point" style="width: 100%; display: flex; justify-content: center; margin-top: 10px;"></div>
              ` : `
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 14px; padding: 16px 20px; text-align: center; margin-top: 10px;">
                  <div style="display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--color-neutral-700); font-size: 13.5px; font-weight: 700;">
                    <i class="fa-solid fa-calendar-xmark" style="color: var(--color-neutral-400); font-size: 16px;"></i>
                    <span>Subscription Completed (${escapeHtml(subHist.startDate || '')} → ${escapeHtml(subHist.endDate || '')})</span>
                  </div>
                  <p style="font-size: 12px; color: var(--color-neutral-500); margin: 6px 0 14px 0;">
                    Daily check-in calendar has ended for this subscription cycle. Total attendance: <strong>${usedDaysCount} days</strong>.
                  </p>
                  <button class="renew-expired-hist-btn btn-primary-action" data-prov-id="${escapeHtml(matchingSub?.providerId || subHist.providerId || '')}" data-plan-id="${escapeHtml(matchingSub?.planId || '')}" style="padding: 7px 18px; font-size: 12px; font-weight: 700; border-radius: 8px; margin: 0 auto; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-rotate-right"></i> Renew Subscription
                  </button>
                </div>
              `}
            </div>
          `;
        })
        .join('');

      // Mount DayPicker MealCalendar ONLY for active subscriptions
      loadedMealHistory.forEach((subHist) => {
        const matchingSub = loadedSubs.find((s) => s.id === subHist.subscriptionId);
        const isSubExpired = matchingSub
          ? (matchingSub.status === 'EXPIRED' || matchingSub.status === 'CANCELLED')
          : (subHist.status === 'EXPIRED' || subHist.status === 'CANCELLED' || (subHist.endDate && subHist.endDate < todayStr));

        if (isSubExpired) return;

        const mountContainer = document.getElementById(`meal-calendar-mount-${subHist.subscriptionId}`);
        if (!mountContainer) return;

        const usageByDate: Record<string, 'checked-in' | 'missed'> = {};
        const detailsByDate: Record<string, { time?: string | null; source?: string | null }> = {};

        (subHist.days || []).forEach((d: any) => {
          if (d.status === 'USED' || d.checkedIn) {
            usageByDate[d.date] = 'checked-in';
          } else if (d.status === 'NOT_CHECKED_IN' || d.status === 'MISSED' || d.status === 'missed') {
            usageByDate[d.date] = 'missed';
          }
          if (d.time || d.source) {
            detailsByDate[d.date] = { time: d.time, source: d.source };
          }
        });

        const unmount = mountMealCalendar(mountContainer, {
          usageByDate,
          startDate: subHist.startDate,
          endDate: subHist.endDate,
          detailsByDate,
          title: 'Meal Attendance',
          subtitle: 'Daily check-in tracker',
        });
        calendarUnmountFns.push(unmount);
      });

      subsGrid.querySelectorAll('.open-scanner-sub-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          openMealScanner(async () => {
            await fetchSubs();
          });
        });
      });

      subsGrid.querySelectorAll('.renew-expired-hist-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const planId = (e.currentTarget as HTMLElement).getAttribute('data-plan-id');
          const provId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
          if (planId) {
            navigate(`/checkout/${planId}`);
          } else if (provId) {
            navigate(`/providers/${provId}`);
          } else {
            navigate('/providers');
          }
        });
      });

      subsGrid.querySelectorAll('.use-recovery-plan-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const pId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
          if (pId) navigate(`/providers/${pId}`);
        });
      });
    } else {
      // SUBSCRIPTION HISTORY TAB
      if (subs.length === 0) {
        subsGrid.innerHTML = `
          <div style="grid-column: 1/-1; background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 24px; padding: 60px; text-align: center;">
            <div style="width: 72px; height: 72px; border-radius: 999px; background: var(--color-neutral-100); display: flex; align-items: center; justify-content: center; font-size: 32px; color: var(--color-neutral-400); margin: 0 auto 16px;">
              <i class="fa-solid fa-receipt"></i>
            </div>
            <h3 class="font-display" style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">No Subscription History</h3>
            <p style="color: var(--color-neutral-500); margin-bottom: 24px; max-width: 440px; margin-left: auto; margin-right: auto;">You haven't purchased a meal subscription yet.</p>
            <button id="historyEmptyBrowseBtn" class="btn-primary-action">
              <i class="fa-solid fa-utensils"></i> Browse Mess
            </button>
          </div>`;
        document.getElementById('historyEmptyBrowseBtn')?.addEventListener('click', () => navigate('/providers'));
        return;
      }

      subsGrid.innerHTML = subs
        .map((s, idx) => {
          const isActive = s.status === 'ACTIVE';
          const isCancelled = s.status === 'CANCELLED';

          let statusBadgeHtml = `
            <span style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-clock-rotate-left"></i> Expired
            </span>
          `;
          if (isActive) {
            statusBadgeHtml = `
              <span style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; display: inline-flex; align-items: center; gap: 5px;">
                <span style="width: 7px; height: 7px; border-radius: 999px; background: #10b981; display: inline-block;"></span> Active
              </span>
            `;
          } else if (isCancelled) {
            statusBadgeHtml = `
              <span style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-ban"></i> Cancelled
              </span>
            `;
          }

          const mealBadgeStyle = s.mealType === 'LUNCH_ONLY'
            ? 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;'
            : s.mealType === 'DINNER_ONLY'
              ? 'background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff;'
              : 'background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa;';

          const mealIcon = s.mealType === 'LUNCH_ONLY'
            ? '<i class="fa-solid fa-bowl-food"></i>'
            : s.mealType === 'DINNER_ONLY'
              ? '<i class="fa-solid fa-moon"></i>'
              : '<i class="fa-solid fa-sun"></i>';

          const mealLabel = s.mealType === 'LUNCH_ONLY'
            ? 'Lunch Only'
            : s.mealType === 'DINNER_ONLY'
              ? 'Dinner Only'
              : 'Full Day Plan';

          return `
          <div class="subscription-history-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 20px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s ease, box-shadow 0.2s ease;">
            <div>
              <!-- Header: Mess Title & Status Pill -->
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                  <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, var(--color-primary-50), #ffedd5); color: var(--color-primary-600); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; border: 1px solid #fed7aa;">
                    <i class="fa-solid fa-utensils"></i>
                  </div>
                  <div style="min-width: 0;">
                    <h3 class="font-display" style="font-size: 17px; font-weight: 800; color: var(--color-neutral-900); margin: 0 0 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(s.messName)}">
                      ${escapeHtml(s.messName)}
                    </h3>
                    <p style="font-size: 12px; color: var(--color-neutral-500); margin: 0; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      <i class="fa-solid fa-location-dot" style="color: var(--color-primary-500); font-size: 11px;"></i>
                      <span>${escapeHtml(s.area)}${s.city ? ', ' + escapeHtml(s.city) : ''}</span>
                    </p>
                  </div>
                </div>
                <div style="flex-shrink: 0;">
                  ${statusBadgeHtml}
                </div>
              </div>

              <!-- Inner Card: Plan, Amount & Payment -->
              <div style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <span style="font-size: 13.5px; font-weight: 700; color: var(--color-neutral-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.planType)}</span>
                    <span style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; ${mealBadgeStyle}; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                      ${mealIcon} ${mealLabel}
                    </span>
                  </div>
                  <span style="font-size: 11px; font-weight: 700; color: ${s.paymentStatus === 'PAID' ? '#15803d' : '#dc2626'}; background: ${s.paymentStatus === 'PAID' ? '#dcfce7' : '#fee2e2'}; padding: 2px 8px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <i class="fa-solid ${s.paymentStatus === 'PAID' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${escapeHtml(s.paymentStatus)}
                  </span>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                  <div>
                    <span style="font-size: 11px; color: var(--color-neutral-500); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 1px;">Amount Paid</span>
                    <span style="font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--color-primary-600); line-height: 1.2;">${escapeHtml(s.amountPaidDisplay)}</span>
                  </div>
                  ${s.status === 'ACTIVE' && s.daysLeft > 0 ? `
                    <span style="font-size: 11px; font-weight: 700; color: #047857; background: #d1fae5; padding: 3px 8px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">
                      <i class="fa-solid fa-hourglass-half"></i> ${s.daysLeft} days left
                    </span>
                  ` : ''}
                </div>
              </div>

              <!-- Metadata Timeline Grid -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: var(--color-neutral-600); margin-bottom: 16px; background: #ffffff; border: 1px solid #f1f5f9; border-radius: 12px; padding: 10px 12px;">
                <div>
                  <span style="font-size: 10.5px; color: var(--color-neutral-400); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 2px;">Payment Date</span>
                  <strong style="color: var(--color-neutral-800); font-size: 12px; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-regular fa-calendar-check" style="color: var(--color-neutral-400); font-size: 11px;"></i> ${escapeHtml(s.paymentDateFormatted)}
                  </strong>
                </div>
                <div>
                  <span style="font-size: 10.5px; color: var(--color-neutral-400); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 2px;">Valid Period</span>
                  <strong style="color: var(--color-neutral-800); font-size: 12px; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-regular fa-clock" style="color: var(--color-neutral-400); font-size: 11px;"></i> ${escapeHtml(s.startDate)} → ${escapeHtml(s.endDate || 'Active')}
                  </strong>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 8px; margin-top: auto;">
              <button class="view-sub-details-btn btn-outline-action" data-idx="${idx}" style="flex: 1; padding: 9px 12px; font-size: 12.5px; font-weight: 700; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #fff;">
                <i class="fa-solid fa-circle-info"></i> View Details
              </button>
              ${s.providerId ? `
                <button class="history-visit-kitchen-btn btn-primary-action" data-prov-id="${escapeHtml(s.providerId)}" style="padding: 9px 14px; font-size: 12.5px; font-weight: 700; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap;">
                  <i class="fa-solid fa-utensils"></i> Kitchen
                </button>
              ` : ''}
            </div>
          </div>
        `;
        })
        .join('');

      subsGrid.querySelectorAll('.view-sub-details-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = Number((e.currentTarget as HTMLElement).getAttribute('data-idx'));
          selectedSubForDetails = loadedSubs[idx];
          renderPage();
          updateContentDisplay();
        });
      });

      subsGrid.querySelectorAll('.history-visit-kitchen-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const pId = (e.currentTarget as HTMLElement).getAttribute('data-prov-id');
          if (pId) navigate(`/providers/${pId}`);
        });
      });
    }
  };

  const fetchSubs = async () => {
    let rawSubs: SubscriptionRecord[] = [];
    try {
      const data: any = await api.get('/subscriptions/history');
      rawSubs = Array.isArray(data) ? data : [];
    } catch (err: any) {
      const subsGrid = document.getElementById('subsGrid');
      if (subsGrid) {
        subsGrid.innerHTML = `
          <div style="grid-column: 1/-1; background: #fff; border: 1px solid #fee2e2; border-radius: 24px; padding: 48px; text-align: center;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 36px; color: #dc2626; margin-bottom: 12px;"></i>
            <h3 class="font-display" style="font-size: 20px; font-weight: 700; color: var(--color-neutral-900); margin-bottom: 8px;">Unable to load subscription history.</h3>
            <p style="color: var(--color-neutral-600); margin-bottom: 20px;">${escapeHtml(err.message || 'Server error while fetching your subscription history.')}</p>
            <button id="retrySubsBtn" class="btn-primary-action" style="padding: 10px 24px;">
              <i class="fa-solid fa-rotate-right"></i> Try Again
            </button>
          </div>`;
        document.getElementById('retrySubsBtn')?.addEventListener('click', fetchSubs);
      }
      return;
    }

    try {
      const [mealHistData, recoveryData]: any[] = await Promise.all([
        getMyMealHistory().catch(() => []),
        getMyRecoveryBalance().catch(() => []),
      ]);
      loadedMealHistory = Array.isArray(mealHistData) ? mealHistData : [];
      loadedRecoveryBalances = Array.isArray(recoveryData) ? recoveryData : [];
    } catch (_) {
      loadedMealHistory = [];
      loadedRecoveryBalances = [];
    }

    loadedSubs = rawSubs.map((s) => {
      const provider = s.mealPlan?.provider || s.provider || {};
      const plan = s.mealPlan || {};
      const messName = provider.name || 'Kitchen Provider';
      const city = provider.city || '';
      const area = provider.address || provider.city || 'Location not recorded';
      const phone = provider.contactPhone || '';
      const planType = plan.title || 'Meal Subscription Plan';

      const rawPaid = s.amountPaid !== undefined && s.amountPaid !== null
        ? s.amountPaid
        : (s.payment?.amount !== undefined && s.payment?.amount !== null ? s.payment.amount : null);

      const parsedPaid = rawPaid !== null && rawPaid !== undefined && !isNaN(Number(rawPaid))
        ? Number(rawPaid)
        : null;

      const amountPaidDisplay = parsedPaid !== null ? `₹${parsedPaid.toLocaleString('en-IN')}` : 'Amount unavailable';

      let rawStatus = (s.status || 'ACTIVE').toUpperCase();
      const startDate = s.startDate || (s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : '');
      const endDate = s.endDate || '';

      const pDate = s.paymentDate || s.createdAt || new Date();
      const paymentDateFormatted = new Date(pDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      let daysLeft = 0;
      if (endDate) {
        const [y, m, d] = endDate.split('-').map(Number);
        const endMs = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999).getTime();
        const diffMs = endMs - Date.now();
        daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }

      if (rawStatus === 'ACTIVE' && endDate && endDate < todayStr) {
        rawStatus = 'EXPIRED';
      }

      const safeRef = s.razorpayOrderId || s.razorpayPaymentId || s.id || 'REF-ACTIVE';

      return {
        id: s.id || '',
        subscriber_name: s.student?.name || s.student?.email || userEmail.split('@')[0],
        messName,
        city,
        area,
        contact_phone: phone,
        planType,
        startDate,
        endDate,
        paymentDateFormatted,
        daysLeft,
        status: rawStatus,
        paymentStatus: (s.paymentStatus || 'PAID').toUpperCase(),
        parsedPaid,
        amountPaidDisplay,
        safeRef,
        planId: plan.id || '',
        providerId: provider.id || '',
        mealType: plan.mealType || (s as any).mealType || 'FULL_DAY',
        mealRecoveryEnabled: (provider as any).mealRecoveryEnabled !== false,
        recoveryDaysApplied: Number(s.recoveryDaysApplied || 0),
        durationDays: Number(plan.durationDays || 30),
      };
    });

    updateContentDisplay();
  };

  const checkPendingOrderOnDashboard = async () => {
    const pendingOrderId = sessionStorage.getItem('pendingPaymentOrderId');
    if (pendingOrderId) {
      console.log(`PAYMENT_PENDING_ORDER orderId=${pendingOrderId}`);
      try {
        const res: any = await api.get(`/payments/${pendingOrderId}/status`);
        console.log(`PAYMENT_STATUS_CHECK orderId=${pendingOrderId} status=${res?.status}`);
        if (res && res.status === 'SUCCESS') {
          sessionStorage.removeItem('pendingPaymentOrderId');
          showToast('Payment verified! Your subscription is now ACTIVE 🎉', 'success');
          await fetchSubs();
        } else if (res && res.status === 'FAILED') {
          sessionStorage.removeItem('pendingPaymentOrderId');
          showToast(res.message || 'Previous payment attempt failed.', 'info');
        }
      } catch (err: any) {
        const isAuthOrNotFound =
          err?.response?.status === 403 ||
          err?.status === 403 ||
          err?.response?.status === 404 ||
          err?.status === 404;
        if (isAuthOrNotFound) {
          sessionStorage.removeItem('pendingPaymentOrderId');
          sessionStorage.removeItem('pendingPaymentPlanId');
        }
      }
    }
  };

  const tabListener = (e: Event) => {
    const customEvent = e as CustomEvent<{ tab: 'PASSES' | 'HISTORY' | 'MEAL_HISTORY' }>;
    const targetTab = customEvent.detail?.tab;
    if (targetTab && (targetTab === 'PASSES' || targetTab === 'MEAL_HISTORY' || targetTab === 'HISTORY')) {
      activeTab = targetTab;
      renderPage();
      updateContentDisplay();
    }
  };
  window.addEventListener('primeplate:switch-tab', tabListener);

  renderPage();
  fetchSubs().then(() => checkPendingOrderOnDashboard());
}
