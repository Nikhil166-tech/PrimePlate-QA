import { renderNavbar, attachNavbarEvents } from '../components/navbar';
import {
  getPaymentHistory,
  getPaymentDetails,
  checkPaymentStatus,
  createSupportTicket,
} from '../api';

export interface PaymentTransaction {
  id: string;
  amount: number;
  currency: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'REFUNDED';
  rawStatus?: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string | null;
  durationDays?: number;
  mealPlanId?: string | null;
  createdAt: string;
  provider?: {
    id: string;
    name: string;
    city?: string;
    address?: string;
  } | null;
  mealPlan?: {
    id: string;
    title: string;
    pricePerMonth: number;
  } | null;
  subscription?: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
  } | null;
  supportTicket?: {
    id: string;
    ticketNumber: string;
    status: string;
    issueType: string;
    createdAt: string;
  } | null;
}

export interface PaymentTimelineEvent {
  event: string;
  title: string;
  description: string;
  timestamp: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED';
}

export interface PaymentDetailData {
  payment: {
    id: string;
    amount: number;
    currency: string;
    status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'REFUNDED';
    rawStatus?: string;
    razorpayOrderId: string;
    razorpayPaymentId?: string | null;
    durationDays: number;
    createdAt: string;
    paymentMethod: string;
  };
  purchaseDetails: {
    mealPlanId?: string;
    mealPlanTitle: string;
    durationDays: number;
    amount: number;
    providerId?: string;
    providerName: string;
    providerAddress: string;
  };
  subscription?: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    messCardAvailable: boolean;
  } | null;
  timeline: PaymentTimelineEvent[];
  supportTicket?: {
    id: string;
    ticketNumber: string;
    status: string;
    issueType: string;
    description: string;
    utrReference?: string | null;
    createdAt: string;
  } | null;
}

let transactionsList: PaymentTransaction[] = [];
let activeFilter: 'ALL' | 'SUCCESS' | 'PENDING' | 'FAILED' | 'REFUNDED' = 'ALL';
let isLoading = true;
let errorMessage: string | null = null;
let selectedOrderDetail: PaymentDetailData | null = null;
let isCheckingStatus = false;

let supportModalOrderId = '';
let supportModalAmount = 0;
let supportIssueType = 'MONEY_DEBITED_PAYMENT_FAILED';
let supportUtr = '';
let supportDescription = '';
let isSubmittingSupport = false;
let supportFormError: string | null = null;
let supportFormSuccessTicket: string | null = null;

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDateTime(dateVal: any, includeSeconds: boolean = false): string {
  if (!dateVal) return 'N/A';
  try {
    const d = typeof dateVal === 'string' || typeof dateVal === 'number' ? new Date(dateVal) : dateVal;
    if (!(d instanceof Date) || isNaN(d.getTime())) return 'N/A';

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    }).format(d);
  } catch (_) {
    return 'N/A';
  }
}

export function formatDateOnly(dateVal: any): string {
  if (!dateVal) return 'N/A';
  try {
    const d = typeof dateVal === 'string' || typeof dateVal === 'number' ? new Date(dateVal) : dateVal;
    if (!(d instanceof Date) || isNaN(d.getTime())) return 'N/A';

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch (_) {
    return 'N/A';
  }
}

export function formatTimeOnly(dateVal: any, includeSeconds: boolean = false): string {
  if (!dateVal) return 'N/A';
  try {
    const d = typeof dateVal === 'string' || typeof dateVal === 'number' ? new Date(dateVal) : dateVal;
    if (!(d instanceof Date) || isNaN(d.getTime())) return 'N/A';

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    }).format(d);
  } catch (_) {
    return 'N/A';
  }
}

function getIssueTypeLabel(type: string): string {
  switch (type) {
    case 'MONEY_DEBITED_PAYMENT_FAILED':
      return 'Money debited but payment failed';
    case 'PAYMENT_SUCCESSFUL_SUBSCRIPTION_MISSING':
      return 'Payment successful but subscription missing';
    case 'PAYMENT_SUCCESSFUL_MESSCARD_MISSING':
      return 'Payment successful but Mess Card missing';
    case 'PAYMENT_STUCK_PENDING':
      return 'Payment stuck pending';
    case 'REFUND_ISSUE':
      return 'Refund issue';
    default:
      return 'Other Payment Issue';
  }
}

export async function renderTransactions() {
  const app = document.getElementById('app');
  if (!app) return;

  const segments = window.location.pathname.split('/').filter(Boolean);
  const hashParts = (window.location.hash || '').split('/').filter(Boolean);
  let orderIdFromUrl: string | null = null;
  if (segments.length >= 3 && segments[1] === 'transactions') {
    orderIdFromUrl = segments[2];
  } else if (hashParts.length >= 3 && hashParts[1] === 'transactions') {
    orderIdFromUrl = hashParts[2];
  }

  app.innerHTML = `
    ${renderNavbar()}
    <main class="page-content" style="min-height: calc(100vh - 140px); background: #f8fafc; padding-top: 64px; padding-bottom: 60px;">
      <div class="container" style="max-width: 960px; margin: 0 auto; padding: 0 12px;">
        
        <!-- Sticky Header when scrolling -->
        <div class="tx-sticky-header">
          <h1 class="font-display" style="font-size: 22px; font-weight: 800; color: var(--color-neutral-900); margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-receipt" style="color: var(--color-primary-600);"></i> Transactions &amp; Support
          </h1>
          <div id="txFilterBarPlaceholder">
            <!-- Filter tabs rendered dynamically -->
          </div>
        </div>

        <div id="transactionsMainContent">
          <!-- Rendered dynamically -->
        </div>

      </div>
    </main>

    <!-- Transaction Detail Drawer / Mobile Bottom Sheet -->
    <div id="transactionDetailDrawer" class="tx-detail-modal-container" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); justify-content: center; z-index: 2500; padding: 16px;">
      <div class="tx-detail-modal-sheet" style="background: #fff; border-radius: 24px; max-width: 540px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3); border: 1px solid var(--color-neutral-200); position: relative;">
        <!-- Drag Handle for Mobile -->
        <div style="width: 38px; height: 5px; background: #e2e8f0; border-radius: 999px; margin: 10px auto 0 auto; display: block;"></div>
        <div id="transactionDetailDrawerBody">
          <!-- Rendered dynamically -->
        </div>
      </div>
    </div>

    <!-- Report Payment Issue Support Modal -->
    <div id="paymentSupportModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); align-items: center; justify-content: center; z-index: 3000; padding: 12px;">
      <div style="background: #fff; border-radius: 24px; max-width: 500px; width: 100%; padding: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); border: 1px solid var(--color-neutral-200); max-height: 90vh; overflow-y: auto;">
        <div id="paymentSupportModalBody">
          <!-- Rendered dynamically -->
        </div>
      </div>
    </div>
  `;

  attachNavbarEvents();
  fetchHistoryAndRender(orderIdFromUrl);
}

async function fetchHistoryAndRender(initialOrderIdToOpen: string | null = null) {
  isLoading = true;
  errorMessage = null;
  renderMainContent();

  try {
    const res: any = await getPaymentHistory();
    transactionsList = Array.isArray(res) ? res : res?.data || [];
    isLoading = false;
    renderMainContent();

    if (initialOrderIdToOpen) {
      openTransactionDetail(initialOrderIdToOpen);
    }
  } catch (err: any) {
    isLoading = false;
    errorMessage = err.message || 'Failed to load transaction history.';
    renderMainContent();
  }
}

function renderMainContent() {
  const container = document.getElementById('transactionsMainContent');
  const filterBarContainer = document.getElementById('txFilterBarPlaceholder');
  if (!container) return;

  if (isLoading) {
    if (filterBarContainer) filterBarContainer.innerHTML = '';
    container.innerHTML = `
      <div style="background: #fff; border-radius: 20px; padding: 48px 16px; text-align: center; border: 1px solid var(--color-neutral-200);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 28px; color: var(--color-primary-600); margin-bottom: 12px;"></i>
        <h4 style="font-size: 15px; font-weight: 700; color: var(--color-neutral-800); margin: 0;">Loading transactions...</h4>
      </div>
    `;
    return;
  }

  if (errorMessage) {
    if (filterBarContainer) filterBarContainer.innerHTML = '';
    container.innerHTML = `
      <div style="background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; padding: 20px; border-radius: 20px; text-align: center;">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 26px; margin-bottom: 8px;"></i>
        <h4 style="font-size: 15px; font-weight: 700; margin: 0 0 6px 0;">Error Loading Transactions</h4>
        <p style="font-size: 13px; margin: 0 0 14px 0;">${escapeHtml(errorMessage)}</p>
        <button id="retryHistoryBtn" class="btn-primary-action" style="padding: 8px 16px; font-size: 13px; border-radius: 10px;">
          Try Again
        </button>
      </div>
    `;
    document.getElementById('retryHistoryBtn')?.addEventListener('click', () => fetchHistoryAndRender());
    return;
  }

  const totalCount = transactionsList.length;
  const successCount = transactionsList.filter((t) => t.status === 'SUCCESS').length;
  const pendingCount = transactionsList.filter((t) => t.status === 'PENDING').length;
  const failedCount = transactionsList.filter((t) => t.status === 'FAILED').length;
  const refundedCount = transactionsList.filter((t) => t.status === 'REFUNDED').length;

  const filteredList = transactionsList.filter((t) => {
    if (activeFilter === 'ALL') return true;
    return t.status === activeFilter;
  });

  if (filterBarContainer) {
    filterBarContainer.innerHTML = `
      <div class="tx-scroll-hide" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch;">
        <button class="filter-tab-btn ${activeFilter === 'ALL' ? 'active' : ''}" data-filter="ALL" style="padding: 8px 14px; font-size: 12px; font-weight: 700; border-radius: 999px; border: 1px solid ${activeFilter === 'ALL' ? 'var(--color-primary-600)' : 'var(--color-neutral-300)'}; background: ${activeFilter === 'ALL' ? 'var(--color-primary-600)' : '#fff'}; color: ${activeFilter === 'ALL' ? '#fff' : 'var(--color-neutral-700)'}; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; min-height: 36px;">
          All <span style="background: ${activeFilter === 'ALL' ? 'rgba(255,255,255,0.25)' : 'var(--color-neutral-100)'}; padding: 1px 7px; border-radius: 999px; font-size: 11px;">${totalCount}</span>
        </button>

        <button class="filter-tab-btn ${activeFilter === 'SUCCESS' ? 'active' : ''}" data-filter="SUCCESS" style="padding: 8px 14px; font-size: 12px; font-weight: 700; border-radius: 999px; border: 1px solid ${activeFilter === 'SUCCESS' ? '#059669' : 'var(--color-neutral-300)'}; background: ${activeFilter === 'SUCCESS' ? '#059669' : '#fff'}; color: ${activeFilter === 'SUCCESS' ? '#fff' : 'var(--color-neutral-700)'}; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; min-height: 36px;">
          Successful <span style="background: ${activeFilter === 'SUCCESS' ? 'rgba(255,255,255,0.25)' : '#d1fae5'}; color: ${activeFilter === 'SUCCESS' ? '#fff' : '#047857'}; padding: 1px 7px; border-radius: 999px; font-size: 11px;">${successCount}</span>
        </button>

        <button class="filter-tab-btn ${activeFilter === 'PENDING' ? 'active' : ''}" data-filter="PENDING" style="padding: 8px 14px; font-size: 12px; font-weight: 700; border-radius: 999px; border: 1px solid ${activeFilter === 'PENDING' ? '#d97706' : 'var(--color-neutral-300)'}; background: ${activeFilter === 'PENDING' ? '#d97706' : '#fff'}; color: ${activeFilter === 'PENDING' ? '#fff' : 'var(--color-neutral-700)'}; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; min-height: 36px;">
          Pending <span style="background: ${activeFilter === 'PENDING' ? 'rgba(255,255,255,0.25)' : '#fef3c7'}; color: ${activeFilter === 'PENDING' ? '#fff' : '#b45309'}; padding: 1px 7px; border-radius: 999px; font-size: 11px;">${pendingCount}</span>
        </button>

        <button class="filter-tab-btn ${activeFilter === 'FAILED' ? 'active' : ''}" data-filter="FAILED" style="padding: 8px 14px; font-size: 12px; font-weight: 700; border-radius: 999px; border: 1px solid ${activeFilter === 'FAILED' ? '#dc2626' : 'var(--color-neutral-300)'}; background: ${activeFilter === 'FAILED' ? '#dc2626' : '#fff'}; color: ${activeFilter === 'FAILED' ? '#fff' : 'var(--color-neutral-700)'}; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; min-height: 36px;">
          Failed <span style="background: ${activeFilter === 'FAILED' ? 'rgba(255,255,255,0.25)' : '#fee2e2'}; color: ${activeFilter === 'FAILED' ? '#fff' : '#b91c1c'}; padding: 1px 7px; border-radius: 999px; font-size: 11px;">${failedCount}</span>
        </button>

        <button class="filter-tab-btn ${activeFilter === 'REFUNDED' ? 'active' : ''}" data-filter="REFUNDED" style="padding: 8px 14px; font-size: 12px; font-weight: 700; border-radius: 999px; border: 1px solid ${activeFilter === 'REFUNDED' ? '#4b5563' : 'var(--color-neutral-300)'}; background: ${activeFilter === 'REFUNDED' ? '#4b5563' : '#fff'}; color: ${activeFilter === 'REFUNDED' ? '#fff' : 'var(--color-neutral-700)'}; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; min-height: 36px;">
          Refunded <span style="background: ${activeFilter === 'REFUNDED' ? 'rgba(255,255,255,0.25)' : '#e5e7eb'}; color: ${activeFilter === 'REFUNDED' ? '#fff' : '#374151'}; padding: 1px 7px; border-radius: 999px; font-size: 11px;">${refundedCount}</span>
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    <!-- Transactions List Cards -->
    ${filteredList.length === 0
      ? `
        <div style="background: #fff; border-radius: 20px; padding: 40px 16px; text-align: center; border: 1px solid var(--color-neutral-200);">
          <i class="fa-solid fa-receipt" style="font-size: 36px; color: var(--color-neutral-300); margin-bottom: 10px;"></i>
          <h4 style="font-size: 15px; font-weight: 700; color: var(--color-neutral-800); margin: 0 0 4px 0;">No transactions found</h4>
          <p style="font-size: 12px; color: var(--color-neutral-500); margin: 0;">No payments match the selected filter.</p>
        </div>
      `
      : `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${filteredList.map((item) => renderTransactionCard(item)).join('')}
        </div>
      `
    }
  `;

  document.querySelectorAll('.filter-tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const filter = (e.currentTarget as HTMLElement).getAttribute('data-filter') as any;
      if (filter) {
        activeFilter = filter;
        renderMainContent();
      }
    });
  });

  document.querySelectorAll('.tx-card-item').forEach((card) => {
    card.addEventListener('click', (e) => {
      const orderId = (e.currentTarget as HTMLElement).getAttribute('data-order-id');
      if (orderId) {
        openTransactionDetail(orderId);
      }
    });
  });

  document.querySelectorAll('.check-status-card-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const orderId = (e.currentTarget as HTMLElement).getAttribute('data-order-id');
      if (orderId) {
        handleCheckStatus(orderId);
      }
    });
  });

  document.querySelectorAll('.report-support-card-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const orderId = (e.currentTarget as HTMLElement).getAttribute('data-order-id');
      const amount = Number((e.currentTarget as HTMLElement).getAttribute('data-amount')) || 0;
      if (orderId) {
        openSupportModal(orderId, amount);
      }
    });
  });
}

export function formatPlanAndDurationTitle(
  mealPlanTitle?: string | null,
  durationDays?: number,
): { title: string; durationLabel: string } {
  const days = Number(durationDays) || 30;

  let durationLabel = '';
  if (days === 1) {
    durationLabel = '1 Day Pass';
  } else if (days === 7) {
    durationLabel = '7 Days Pass';
  } else if (days === 15) {
    durationLabel = '15 Days Pass';
  } else if (days === 30) {
    durationLabel = '30 Days (1 Month)';
  } else {
    const unit = days === 1 ? 'Day' : 'Days';
    durationLabel = `${days} ${unit}`;
  }

  const raw = (mealPlanTitle || '').trim();
  const title = raw || 'Meal Plan';

  return { title, durationLabel };
}

function renderTransactionCard(t: PaymentTransaction): string {
  let badgeBg = '#f3f4f6';
  let badgeColor = '#374151';
  let badgeIcon = 'fa-circle-info';
  let badgeText: string = String(t.status);

  if (t.status === 'SUCCESS') {
    badgeBg = '#d1fae5';
    badgeColor = '#047857';
    badgeIcon = 'fa-circle-check';
    badgeText = 'SUCCESSFUL';
  } else if (t.status === 'PENDING') {
    badgeBg = '#fef3c7';
    badgeColor = '#b45309';
    badgeIcon = 'fa-clock';
    badgeText = 'PENDING';
  } else if (t.status === 'FAILED') {
    badgeBg = '#fee2e2';
    badgeColor = '#b91c1c';
    badgeIcon = 'fa-circle-xmark';
    badgeText = 'FAILED';
  } else if (t.status === 'REFUNDED') {
    badgeBg = '#e5e7eb';
    badgeColor = '#374151';
    badgeIcon = 'fa-rotate-left';
    badgeText = 'REFUNDED';
  }

  const { title: displayPlanTitle } = formatPlanAndDurationTitle(
    t.mealPlan?.title,
    t.durationDays,
  );
  const providerName = t.provider?.name || 'Mess Provider';

  return `
    <div class="tx-card-item" data-order-id="${escapeHtml(t.razorpayOrderId)}" style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 16px; padding: 16px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
      <div class="tx-card-mobile-flex" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
            <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid ${badgeIcon}"></i> ${badgeText}
            </span>

            ${t.supportTicket
      ? `
              <span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-headset"></i> Ticket #${escapeHtml(t.supportTicket.ticketNumber)}
              </span>
            `
      : ''
    }
          </div>

          <h4 class="font-display" style="font-size: 15px; font-weight: 800; color: var(--color-neutral-900); margin: 0 0 3px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(displayPlanTitle)}
          </h4>

          <p style="font-size: 12px; color: var(--color-neutral-600); margin: 0 0 5px 0; display: flex; align-items: center; gap: 5px;">
            <i class="fa-solid fa-building-user" style="color: var(--color-primary-600);"></i>
            <span style="font-weight: 600; color: var(--color-neutral-800);">${escapeHtml(providerName)}</span>
          </p>

          <div style="display: flex; gap: 8px; font-size: 11.5px; color: var(--color-neutral-700); flex-wrap: wrap;">
            <span style="display: inline-flex; align-items: center; gap: 4px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 6px; font-weight: 600;">
              <i class="fa-regular fa-calendar-days" style="color: var(--color-primary-600);"></i> ${formatDateOnly(t.createdAt)}
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 6px; font-weight: 600;">
              <i class="fa-regular fa-clock" style="color: var(--color-primary-600);"></i> ${formatTimeOnly(t.createdAt)}
            </span>
          </div>
        </div>

        <div class="tx-card-mobile-right" style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; shrink: 0;">
          <span class="font-display" style="font-size: 18px; font-weight: 800; color: var(--color-neutral-900);">
            ₹${Number(t.amount).toLocaleString('en-IN')}
          </span>

          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${t.status === 'PENDING'
      ? `
              <button class="check-status-card-btn btn-primary-action" data-order-id="${escapeHtml(t.razorpayOrderId)}" style="padding: 5px 10px; font-size: 11px; font-weight: 700; border-radius: 8px;">
                Check Status
              </button>
            `
      : ''
    }

            ${t.status === 'FAILED' || t.status === 'PENDING'
      ? `
              <button class="report-support-card-btn btn-outline-action" data-order-id="${escapeHtml(t.razorpayOrderId)}" data-amount="${t.amount}" style="padding: 5px 10px; font-size: 11px; font-weight: 700; border-radius: 8px; background: #fff;">
                Report Issue
              </button>
            `
      : ''
    }
          </div>
        </div>

      </div>
    </div>
  `;
}

async function openTransactionDetail(orderId: string) {
  const drawer = document.getElementById('transactionDetailDrawer');
  const body = document.getElementById('transactionDetailDrawerBody');
  if (!drawer || !body) return;

  drawer.style.display = 'flex';
  selectedOrderDetail = null;
  window.history.replaceState({}, '', `/student/transactions/${encodeURIComponent(orderId)}`);

  body.innerHTML = `
    <div style="padding: 36px 16px; text-align: center;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 26px; color: var(--color-primary-600); margin-bottom: 10px;"></i>
      <p style="font-size: 13px; font-weight: 600; color: var(--color-neutral-700); margin: 0;">Loading payment details...</p>
    </div>
  `;

  try {
    const res: any = await getPaymentDetails(orderId);
    selectedOrderDetail = res;
    renderDrawerContent();
  } catch (err: any) {
    body.innerHTML = `
      <div style="padding: 28px 16px; text-align: center;">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 28px; color: #dc2626; margin-bottom: 10px;"></i>
        <h4 style="font-size: 15px; font-weight: 700; color: var(--color-neutral-900); margin: 0 0 4px 0;">Error Loading Details</h4>
        <p style="font-size: 12px; color: var(--color-neutral-600); margin: 0 0 16px 0;">${escapeHtml(err.message || 'Access denied or order not found.')}</p>
        <button id="closeDetailDrawerBtn" class="btn-outline-action" style="padding: 7px 14px; font-size: 12px; border-radius: 10px;">Close</button>
      </div>
    `;
    document.getElementById('closeDetailDrawerBtn')?.addEventListener('click', closeDetailDrawer);
  }
}

function closeDetailDrawer() {
  const drawer = document.getElementById('transactionDetailDrawer');
  if (drawer) drawer.style.display = 'none';
  window.history.replaceState({}, '', '/student/transactions');
}

function renderDrawerContent() {
  const body = document.getElementById('transactionDetailDrawerBody');
  if (!body || !selectedOrderDetail) return;

  const { payment, purchaseDetails, subscription, timeline, supportTicket } = selectedOrderDetail;
  const { title: drawerPlanTitle, durationLabel } = formatPlanAndDurationTitle(
    purchaseDetails.mealPlanTitle,
    purchaseDetails.durationDays,
  );

  let badgeBg = '#f3f4f6';
  let badgeColor = '#374151';
  let badgeText: string = String(payment.status);

  if (payment.status === 'SUCCESS') {
    badgeBg = '#d1fae5';
    badgeColor = '#047857';
    badgeText = 'SUCCESSFUL';
  } else if (payment.status === 'PENDING') {
    badgeBg = '#fef3c7';
    badgeColor = '#b45309';
    badgeText = 'PENDING';
  } else if (payment.status === 'FAILED') {
    badgeBg = '#fee2e2';
    badgeColor = '#b91c1c';
    badgeText = 'FAILED';
  } else if (payment.status === 'REFUNDED') {
    badgeBg = '#e5e7eb';
    badgeColor = '#374151';
    badgeText = 'REFUNDED';
  }

  body.innerHTML = `
    <!-- Header -->
    <div style="padding: 16px 20px; border-bottom: 1px solid var(--color-neutral-200); display: flex; justify-content: space-between; align-items: center; background: var(--color-neutral-50);">
      <div>
        <span style="font-size: 10px; font-weight: 800; color: var(--color-neutral-500); text-transform: uppercase; letter-spacing: 0.5px;">ORDER TRANSACTION</span>
        <h3 class="font-display" style="font-size: 18px; font-weight: 800; color: var(--color-neutral-900); margin: 2px 0 0 0;">
          ₹${Number(payment.amount).toLocaleString('en-IN')} <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; margin-left: 6px;">${badgeText}</span>
        </h3>
      </div>
      <button id="closeDetailDrawerBtn" style="background: none; border: none; font-size: 22px; color: var(--color-neutral-500); cursor: pointer; padding: 4px;">&times;</button>
    </div>

    <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">

      <!-- Summary Box -->
      <div style="background: #f8fafc; border: 1px solid var(--color-neutral-200); border-radius: 14px; padding: 14px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
          <div>
            <span style="color: var(--color-neutral-500); display: block; font-size: 10px; font-weight: 700;">MEAL PLAN</span>
            <span style="font-weight: 700; color: var(--color-neutral-900);">${escapeHtml(drawerPlanTitle)}</span>
          </div>
          <div>
            <span style="color: var(--color-neutral-500); display: block; font-size: 10px; font-weight: 700;">DURATION</span>
            <span style="font-weight: 700; color: var(--color-neutral-900);">${durationLabel}</span>
          </div>
          <div>
            <span style="color: var(--color-neutral-500); display: block; font-size: 10px; font-weight: 700;">HOSTEL / MESS PROVIDER</span>
            <span style="font-weight: 700; color: var(--color-neutral-900);">${escapeHtml(purchaseDetails.providerName || 'Mess Provider')}</span>
          </div>
          <div>
            <span style="color: var(--color-neutral-500); display: block; font-size: 10px; font-weight: 700;">PAYMENT METHOD</span>
            <span style="font-weight: 700; color: var(--color-neutral-900);">${escapeHtml(payment.paymentMethod)}</span>
          </div>
        </div>

        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--color-neutral-200); font-size: 11.5px; color: var(--color-neutral-600); display: flex; flex-direction: column; gap: 4px;">
          <div><strong>Order ID:</strong> <code style="font-size: 11px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${escapeHtml(payment.razorpayOrderId)}</code></div>
          ${payment.razorpayPaymentId ? `<div><strong>Payment ID:</strong> <code style="font-size: 11px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${escapeHtml(payment.razorpayPaymentId)}</code></div>` : ''}
        </div>
      </div>

      <!-- Support Ticket Section -->
      ${supportTicket
      ? `
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 14px; padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 12px; font-weight: 800; color: #1e40af; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-headset"></i> Ticket #${escapeHtml(supportTicket.ticketNumber)}
            </span>
            <span style="background: #dbeafe; color: #1e40af; padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 800;">
              ${escapeHtml(supportTicket.status)}
            </span>
          </div>
          <p style="font-size: 11px; color: #1e3a8a; margin: 0 0 3px 0;"><strong>Issue:</strong> ${getIssueTypeLabel(supportTicket.issueType)}</p>
          <p style="font-size: 11px; color: #3b82f6; margin: 0;"><strong>Description:</strong> ${escapeHtml(supportTicket.description)}</p>
        </div>
      `
      : ''
    }

      <!-- Timeline -->
      <div>
        <h4 style="font-size: 12px; font-weight: 800; color: var(--color-neutral-800); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px 0;">
          <i class="fa-solid fa-timeline" style="color: var(--color-primary-600);"></i> Status Timeline Track
        </h4>

        <div style="display: flex; flex-direction: column; gap: 14px; padding-left: 6px; border-left: 2px solid var(--color-neutral-200); margin-left: 6px;">
          ${timeline
      .map(
        (event) => `
            <div style="position: relative; padding-left: 16px;">
              <div style="position: absolute; left: -14px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: ${event.status === 'COMPLETED' ? '#10b981' : event.status === 'FAILED' ? '#ef4444' : '#f59e0b'}; border: 2px solid #fff; box-shadow: 0 0 0 2px ${event.status === 'COMPLETED' ? '#a7f3d0' : event.status === 'FAILED' ? '#fca5a5' : '#fde68a'};"></div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                <div style="font-size: 13px; font-weight: 800; color: var(--color-neutral-900); display: flex; align-items: center; gap: 6px;">
                  ${event.status === 'COMPLETED' ? '<i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 13px;"></i>' : event.status === 'FAILED' ? '<i class="fa-solid fa-circle-xmark" style="color: #ef4444; font-size: 13px;"></i>' : '<i class="fa-solid fa-clock" style="color: #f59e0b; font-size: 13px;"></i>'}
                  ${escapeHtml(event.title)}
                </div>
                <div style="font-size: 11px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; border: 1px solid #e2e8f0; display: inline-flex; align-items: center; gap: 4px;">
                  <i class="fa-regular fa-clock" style="color: var(--color-primary-600); font-size: 10px;"></i> ${formatDateTime(event.timestamp)}
                </div>
              </div>
              <div style="font-size: 12px; color: var(--color-neutral-600); margin-top: 3px; line-height: 1.4;">${escapeHtml(event.description)}</div>
            </div>
          `,
      )
      .join('')}
        </div>
      </div>

      <!-- Footer Buttons -->
      <div style="display: flex; gap: 8px; border-top: 1px solid var(--color-neutral-200); padding-top: 14px; flex-wrap: wrap;">
        ${payment.status === 'PENDING'
      ? `
          <button id="drawerCheckStatusBtn" class="btn-primary-action" style="flex: 1; min-width: 130px; justify-content: center; padding: 9px; font-size: 12px;">
            ${isCheckingStatus ? '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...' : '<i class="fa-solid fa-arrows-rotate"></i> Check Status'}
          </button>
        `
      : ''
    }

        ${payment.status === 'FAILED'
      ? `
          <a href="/providers" class="btn-primary-action" style="flex: 1; min-width: 120px; text-decoration: none; justify-content: center; padding: 9px; font-size: 12px;">
            <i class="fa-solid fa-rotate-right"></i> Try Again
          </a>
        `
      : ''
    }

        ${payment.status === 'SUCCESS' && subscription
      ? `
          <a href="/student/dashboard" class="btn-primary-action" style="flex: 1; min-width: 130px; text-decoration: none; justify-content: center; padding: 9px; font-size: 12px;">
            <i class="fa-solid fa-qrcode"></i> View Mess Card
          </a>
        `
      : ''
    }

        ${payment.status === 'SUCCESS' && !subscription
      ? `
          <button id="drawerCheckStatusBtn" class="btn-outline-action" style="flex: 1; min-width: 130px; justify-content: center; padding: 9px; font-size: 12px; background: #fff;">
            <i class="fa-solid fa-arrows-rotate"></i> Sync Subscription
          </button>
        `
      : ''
    }

        <button id="drawerReportIssueBtn" class="btn-outline-action" style="flex: 1; min-width: 130px; justify-content: center; padding: 9px; font-size: 12px; background: #fff;">
          <i class="fa-solid fa-headset"></i> ${supportTicket ? 'View Ticket' : 'Report Issue'}
        </button>
      </div>

    </div>
  `;

  document.getElementById('closeDetailDrawerBtn')?.addEventListener('click', closeDetailDrawer);

  document.getElementById('drawerCheckStatusBtn')?.addEventListener('click', () => {
    handleCheckStatus(payment.razorpayOrderId);
  });

  document.getElementById('drawerReportIssueBtn')?.addEventListener('click', () => {
    openSupportModal(payment.razorpayOrderId, Number(payment.amount));
  });
}

async function handleCheckStatus(orderId: string) {
  if (isCheckingStatus) return;
  isCheckingStatus = true;

  try {
    const statusRes: any = await checkPaymentStatus(orderId);
    isCheckingStatus = false;

    if (statusRes?.status === 'SUCCESS') {
      alert('Payment Verified! Your subscription and Mess Card are now ACTIVE 🎉');
      fetchHistoryAndRender(orderId);
    } else if (statusRes?.status === 'FAILED') {
      alert('Backend confirmed payment attempt FAILED.');
      fetchHistoryAndRender(orderId);
    } else {
      alert('Payment is still PROCESSING. Please check again shortly or report issue.');
      fetchHistoryAndRender(orderId);
    }
  } catch (err: any) {
    isCheckingStatus = false;
    alert(`Status check failed: ${err.message || 'Server error'}`);
  }
}

function openSupportModal(orderId: string, amount: number) {
  const modal = document.getElementById('paymentSupportModal');
  const body = document.getElementById('paymentSupportModalBody');
  if (!modal || !body) return;

  supportModalOrderId = orderId;
  supportModalAmount = amount;
  supportIssueType = 'MONEY_DEBITED_PAYMENT_FAILED';
  supportUtr = '';
  supportDescription = '';
  supportFormError = null;
  supportFormSuccessTicket = null;

  modal.style.display = 'flex';
  renderSupportModalContent();
}

function closeSupportModal() {
  const modal = document.getElementById('paymentSupportModal');
  if (modal) modal.style.display = 'none';
}

function renderSupportModalContent() {
  const body = document.getElementById('paymentSupportModalBody');
  if (!body) return;

  body.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--color-neutral-200); padding-bottom: 10px;">
      <h3 class="font-display" style="font-size: 16px; font-weight: 800; color: var(--color-neutral-900); margin: 0; display: flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-headset" style="color: var(--color-primary-600);"></i> Report Payment Problem
      </h3>
      <button id="closeSupportModalBtn" style="background: none; border: none; font-size: 22px; cursor: pointer; color: var(--color-neutral-500); padding: 0 4px;">&times;</button>
    </div>

    ${supportFormSuccessTicket
      ? `
      <div style="background: #d1fae5; border: 1px solid #a7f3d0; color: #065f46; padding: 18px 14px; border-radius: 14px; text-align: center; margin-bottom: 14px;">
        <i class="fa-solid fa-circle-check" style="font-size: 28px; margin-bottom: 6px; color: #059669;"></i>
        <h4 style="font-size: 15px; font-weight: 800; margin: 0 0 4px 0;">Ticket Raised Successfully!</h4>
        <p style="font-size: 13px; margin: 0 0 10px 0;">Ticket Reference: <strong>${escapeHtml(supportFormSuccessTicket)}</strong></p>
        <p style="font-size: 11px; color: #047857; margin: 0;">Our PrimePlate Support Team will investigate and update status.</p>
      </div>
      <button id="doneSupportModalBtn" class="btn-primary-action" style="width: 100%; justify-content: center; padding: 9px; font-weight: 700; border-radius: 10px; font-size: 13px;">Done</button>
    `
      : `
      ${supportFormError
        ? `
        <div style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">
          ${escapeHtml(supportFormError)}
        </div>
      `
        : ''
      }

      <form id="supportTicketForm" style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="font-size: 11px; font-weight: 700; color: var(--color-neutral-700); display: block; margin-bottom: 3px;">Order ID</label>
          <input type="text" value="${escapeHtml(supportModalOrderId)}" readonly style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-neutral-300); background: #f1f5f9; font-size: 12px; font-family: monospace; font-weight: 700; color: var(--color-neutral-800);" />
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 700; color: var(--color-neutral-700); display: block; margin-bottom: 3px;">Amount</label>
          <input type="text" value="₹${supportModalAmount.toLocaleString('en-IN')}" readonly style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-neutral-300); background: #f1f5f9; font-size: 12px; font-weight: 700; color: var(--color-neutral-800);" />
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 700; color: var(--color-neutral-700); display: block; margin-bottom: 3px;">Issue Type *</label>
          <select id="supportIssueTypeSelect" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-neutral-300); background: #fff; font-size: 12px; font-weight: 600; min-height: 38px;">
            <option value="MONEY_DEBITED_PAYMENT_FAILED" ${supportIssueType === 'MONEY_DEBITED_PAYMENT_FAILED' ? 'selected' : ''}>Money debited but payment failed</option>
            <option value="PAYMENT_SUCCESSFUL_SUBSCRIPTION_MISSING" ${supportIssueType === 'PAYMENT_SUCCESSFUL_SUBSCRIPTION_MISSING' ? 'selected' : ''}>Payment successful but subscription missing</option>
            <option value="PAYMENT_SUCCESSFUL_MESSCARD_MISSING" ${supportIssueType === 'PAYMENT_SUCCESSFUL_MESSCARD_MISSING' ? 'selected' : ''}>Payment successful but Mess Card missing</option>
            <option value="PAYMENT_STUCK_PENDING" ${supportIssueType === 'PAYMENT_STUCK_PENDING' ? 'selected' : ''}>Payment stuck pending</option>
            <option value="REFUND_ISSUE" ${supportIssueType === 'REFUND_ISSUE' ? 'selected' : ''}>Refund issue</option>
            <option value="OTHER" ${supportIssueType === 'OTHER' ? 'selected' : ''}>Other payment issue</option>
          </select>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 700; color: var(--color-neutral-700); display: block; margin-bottom: 3px;">UTR / Bank Reference (Optional)</label>
          <input type="text" id="supportUtrInput" value="${escapeHtml(supportUtr)}" placeholder="e.g. 423910293841" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-neutral-300); font-size: 12px;" />
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 700; color: var(--color-neutral-700); display: block; margin-bottom: 3px;">Description *</label>
          <textarea id="supportDescriptionInput" rows="3" placeholder="Describe what happened, UPI app used..." style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-neutral-300); font-size: 12px; font-family: inherit;">${escapeHtml(supportDescription)}</textarea>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button type="button" id="cancelSupportModalBtn" class="btn-outline-action" style="flex: 1; padding: 9px; font-size: 12px; border-radius: 10px; justify-content: center; background: #fff;">Cancel</button>
          <button type="submit" id="submitSupportModalBtn" class="btn-primary-action" style="flex: 1; padding: 9px; font-size: 12px; border-radius: 10px; justify-content: center;">
            ${isSubmittingSupport ? '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...' : '<i class="fa-solid fa-paper-plane"></i> Submit Ticket'}
          </button>
        </div>
      </form>
    `
    }
  `;

  document.getElementById('closeSupportModalBtn')?.addEventListener('click', closeSupportModal);
  document.getElementById('cancelSupportModalBtn')?.addEventListener('click', closeSupportModal);
  document.getElementById('doneSupportModalBtn')?.addEventListener('click', () => {
    closeSupportModal();
    fetchHistoryAndRender();
  });

  const form = document.getElementById('supportTicketForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const issueSelect = document.getElementById('supportIssueTypeSelect') as HTMLSelectElement;
    const utrInput = document.getElementById('supportUtrInput') as HTMLInputElement;
    const descInput = document.getElementById('supportDescriptionInput') as HTMLTextAreaElement;

    supportIssueType = issueSelect?.value || 'OTHER';
    supportUtr = utrInput?.value?.trim() || '';
    supportDescription = descInput?.value?.trim() || '';

    if (!supportDescription) {
      supportFormError = 'Please enter a description of the payment problem.';
      renderSupportModalContent();
      return;
    }

    isSubmittingSupport = true;
    supportFormError = null;
    renderSupportModalContent();

    try {
      const res: any = await createSupportTicket({
        razorpayOrderId: supportModalOrderId,
        issueType: supportIssueType,
        description: supportDescription,
        utrReference: supportUtr || undefined,
      });

      isSubmittingSupport = false;
      supportFormSuccessTicket = res?.ticketNumber || 'TK-SUBMITTED';
      renderSupportModalContent();
    } catch (err: any) {
      isSubmittingSupport = false;
      supportFormError = err.message || 'Failed to submit support ticket.';
      renderSupportModalContent();
    }
  });
}
