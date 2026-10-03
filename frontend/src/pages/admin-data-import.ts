import {
  validateImportPackage,
  previewDataImport,
  executeDataImport,
  getDataImportProgress,
  getDataImportHistory,
  getDataImportById,
} from '../api';
import type {
  ValidationReport,
  PreviewReport,
  ExecutionReport,
} from '../api';
import { navigate } from '../router';
import { showToast } from '../components/toast';
import { renderNavbar, attachNavbarEvents } from '../components/navbar';
import { renderFooter, attachFooterEvents } from '../components/footer';
import { escapeHtml } from '../utils/sanitize';

let currentValidation: ValidationReport | null = null;
let currentPreview: PreviewReport | null = null;
let selectedMode: 'REPLACE' | 'MERGE' = 'MERGE';
let progressInterval: any = null;

export async function renderAdminDataImport() {
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
    <main class="main-content" style="padding-top: 88px; padding-bottom: 60px; min-height: 100vh; background: #f8fafc;">
      <div style="max-width: 1280px; margin: 0 auto; padding: 0 16px;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 11px; font-weight: 800; color: #dc2626; background: #fee2e2; padding: 3px 10px; border-radius: 999px; letter-spacing: 0.5px;">
                ADMIN DATA MANAGEMENT
              </span>
              <span style="font-size: 11px; font-weight: 700; color: #166534; background: #dcfce7; padding: 3px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-shield-halved"></i> QA ISOLATED TARGET
              </span>
            </div>
            <h1 class="font-display" style="font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; color: var(--color-neutral-900); margin: 0 0 4px 0;">
              Production Data Import & Migration
            </h1>
            <p style="color: var(--color-neutral-600); font-size: clamp(0.875rem, 2vw, 0.95rem); margin: 0;">
              Securely import, sanitize, and map versioned production export packages into the isolated QA database.
            </p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--color-neutral-200); padding-bottom: 12px; overflow-x: auto;">
          <a href="/admin" class="btn-outline-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap;">
            <i class="fa-solid fa-shield-halved"></i> Provider Approvals
          </a>
          <a href="/admin/earnings" class="btn-outline-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap;">
            <i class="fa-solid fa-wallet"></i> Provider Earnings
          </a>
          <a href="/admin/settings" class="btn-outline-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap;">
            <i class="fa-solid fa-sliders"></i> Platform & Fee Settings
          </a>
          <a href="/admin/data-import" class="btn-primary-action" style="font-size: 13px; text-decoration: none; padding: 8px 16px; border-radius: 999px; white-space: nowrap; background: #dc2626;">
            <i class="fa-solid fa-file-import"></i> Production Data Import
          </a>
        </div>

        <!-- Safety Assurance Card -->
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: flex-start; gap: 14px;">
          <div style="color: #2563eb; font-size: 20px; margin-top: 2px;">
            <i class="fa-solid fa-lock"></i>
          </div>
          <div style="font-size: 13px; color: #1e3a8a; line-height: 1.5;">
            <strong>Automated Zero-Production-Leak Guard:</strong> All incoming records are strictly pseudonymized, credentials and authentication tokens are stripped, passwords are replaced with QA test credentials, and database writes are strictly restricted to the local/QA database. Arbitrary SQL execution and live Razorpay triggers are blocked.
          </div>
        </div>

        <!-- STEP 1: Upload Zone -->
        <div class="card" style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.03); margin-bottom: 24px;">
          <h2 style="font-size: 18px; font-weight: 800; color: var(--color-neutral-900); margin: 0 0 8px 0; display: flex; align-items: center; gap: 10px;">
            <span style="width: 28px; height: 28px; border-radius: 8px; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800;">1</span>
            Upload Production Export Package (.zip)
          </h2>
          <p style="color: var(--color-neutral-600); font-size: 13px; margin: 0 0 20px 0;">
            Accepts a versioned PrimePlate export ZIP containing <code>manifest.json</code> and entity tables (users, providers, meal-plans, subscriptions, meal-usages, reviews, provider-earnings). Max size: 50MB.
          </p>

          <div id="dropZone" style="border: 2px dashed #cbd5e1; border-radius: 16px; padding: 36px 20px; text-align: center; background: #f8fafc; cursor: pointer; transition: all 0.2s ease;">
            <i class="fa-solid fa-file-zipper" style="font-size: 40px; color: #64748b; margin-bottom: 12px; display: block;"></i>
            <p style="font-size: 15px; font-weight: 700; color: var(--color-neutral-800); margin: 0 0 4px 0;">
              Click to select or drag & drop export ZIP file here
            </p>
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 16px 0;">
              Only structured JSON export ZIP archives are supported
            </p>
            <input type="file" id="zipFileInput" accept=".zip,application/zip" style="display: none;" />
            <button type="button" id="browseBtn" class="btn-outline-action" style="padding: 8px 20px; font-size: 13px; font-weight: 700;">
              <i class="fa-solid fa-folder-open"></i> Browse Files
            </button>
          </div>

          <!-- Upload Progress -->
          <div id="uploadProgressContainer" style="display: none; margin-top: 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--color-neutral-700); margin-bottom: 6px;">
              <span id="uploadStatusText">Uploading & validating package...</span>
              <span id="uploadPercentText">0%</span>
            </div>
            <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
              <div id="uploadProgressBar" style="width: 0%; height: 100%; background: #dc2626; transition: width 0.2s ease;"></div>
            </div>
          </div>
        </div>

        <!-- STEP 2: Validation Results Section -->
        <div id="validationSection" style="display: none; margin-bottom: 24px;"></div>

        <!-- STEP 3: Preview & Execution Section -->
        <div id="previewSection" style="display: none; margin-bottom: 24px;"></div>

        <!-- STEP 4: Execution Progress & Results Section -->
        <div id="executionSection" style="display: none; margin-bottom: 24px;"></div>

        <!-- STEP 5: Import History & Audit Trail -->
        <div class="card" style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
            <h2 style="font-size: 18px; font-weight: 800; color: var(--color-neutral-900); margin: 0; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-clock-rotate-left" style="color: #64748b;"></i> Import Audit History
            </h2>
            <button id="refreshHistoryBtn" class="btn-outline-action" style="padding: 6px 14px; font-size: 12px; font-weight: 700;">
              <i class="fa-solid fa-rotate-right"></i> Refresh History
            </button>
          </div>
          <div id="historyTableContainer">
            <p style="color: #64748b; font-size: 13px;">Loading audit logs...</p>
          </div>
        </div>

      </div>
    </main>

    <!-- Modal for Detailed Audit Record -->
    <div id="auditDetailModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center; padding: 16px;">
      <div style="background: #fff; border-radius: 20px; max-width: 640px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 id="modalTitle" style="font-size: 18px; font-weight: 800; margin: 0;">Import Record Details</h3>
          <button id="closeModalBtn" style="background: none; border: none; font-size: 18px; color: #64748b; cursor: pointer;">&times;</button>
        </div>
        <div id="modalContent" style="font-size: 13px; color: #334155; line-height: 1.6;"></div>
      </div>
    </div>

    <!-- Modal for Execution Confirmation -->
    <div id="confirmationModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 10000; align-items: center; justify-content: center; padding: 16px;">
      <div style="background: #fff; border-radius: 20px; max-width: 540px; width: 100%; padding: 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.25);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 20px;">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div>
            <h3 id="confirmModalTitle" style="font-size: 18px; font-weight: 800; color: #1e293b; margin: 0;">
              Confirm QA Data Import
            </h3>
            <span id="confirmModalBadge" style="font-size: 11px; font-weight: 700; color: #dc2626;">MODE: REPLACE QA</span>
          </div>
        </div>

        <p id="confirmModalDesc" style="font-size: 13px; color: #475569; margin-bottom: 16px; line-height: 1.5;">
          This action will execute the migration within a database transaction.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
          <label style="display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px;">
            Type exact confirmation phrase to proceed:
          </label>
          <div id="requiredPhraseDisplay" style="font-family: monospace; font-size: 12px; color: #0f172a; background: #e2e8f0; padding: 8px 12px; border-radius: 8px; margin-bottom: 10px; user-select: all;">
            I understand this will replace the selected QA data.
          </div>
          <input type="text" id="confirmPhraseInput" placeholder="Type or paste exact phrase here..." style="width: 100%; padding: 10px 14px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;" />
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" id="cancelConfirmBtn" class="btn-outline-action" style="padding: 9px 18px; font-size: 13px; font-weight: 700;">
            Cancel
          </button>
          <button type="button" id="proceedExecuteBtn" disabled class="btn-primary-action" style="padding: 9px 20px; font-size: 13px; font-weight: 800; background: #dc2626; opacity: 0.5; cursor: not-allowed;">
            <i class="fa-solid fa-play"></i> Execute Import
          </button>
        </div>
      </div>
    </div>

    ${renderFooter()}
  `;

  attachNavbarEvents();
  attachFooterEvents();
  setupEventListeners();
  loadImportHistory();
}

function setupEventListeners() {
  const dropZone = document.getElementById('dropZone')!;
  const fileInput = document.getElementById('zipFileInput') as HTMLInputElement;
  const browseBtn = document.getElementById('browseBtn')!;
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn')!;
  const closeModalBtn = document.getElementById('closeModalBtn')!;
  const auditModal = document.getElementById('auditDetailModal')!;
  const confirmationModal = document.getElementById('confirmationModal')!;
  const cancelConfirmBtn = document.getElementById('cancelConfirmBtn')!;
  const confirmPhraseInput = document.getElementById('confirmPhraseInput') as HTMLInputElement;
  const proceedExecuteBtn = document.getElementById('proceedExecuteBtn') as HTMLButtonElement;

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#dc2626';
    dropZone.style.background = '#fef2f2';
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e1';
    dropZone.style.background = '#f8fafc';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e1';
    dropZone.style.background = '#f8fafc';
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileUpload(fileInput.files[0]);
    }
  });

  refreshHistoryBtn.addEventListener('click', () => loadImportHistory());

  closeModalBtn.addEventListener('click', () => {
    auditModal.style.display = 'none';
  });

  cancelConfirmBtn.addEventListener('click', () => {
    confirmationModal.style.display = 'none';
  });

  confirmPhraseInput.addEventListener('input', () => {
    const targetPhrase = (document.getElementById('requiredPhraseDisplay')!.textContent || '').trim();
    if (confirmPhraseInput.value.trim() === targetPhrase) {
      proceedExecuteBtn.disabled = false;
      proceedExecuteBtn.style.opacity = '1';
      proceedExecuteBtn.style.cursor = 'pointer';
    } else {
      proceedExecuteBtn.disabled = true;
      proceedExecuteBtn.style.opacity = '0.5';
      proceedExecuteBtn.style.cursor = 'not-allowed';
    }
  });

  proceedExecuteBtn.addEventListener('click', () => {
    confirmationModal.style.display = 'none';
    startExecution();
  });
}

async function handleFileUpload(file: File) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showToast('Please upload a .zip export package file.', 'error');
    return;
  }

  const progressContainer = document.getElementById('uploadProgressContainer')!;
  const progressBar = document.getElementById('uploadProgressBar')!;
  const percentText = document.getElementById('uploadPercentText')!;
  const statusText = document.getElementById('uploadStatusText')!;
  const validationSection = document.getElementById('validationSection')!;
  const previewSection = document.getElementById('previewSection')!;

  validationSection.style.display = 'none';
  previewSection.style.display = 'none';
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  percentText.textContent = '0%';
  statusText.textContent = `Uploading ${file.name}...`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const report = await validateImportPackage(formData, (e) => {
      if (e.total) {
        const percent = Math.round((e.loaded * 100) / e.total);
        progressBar.style.width = `${percent}%`;
        percentText.textContent = `${percent}%`;
      }
    });

    currentValidation = report;
    progressBar.style.width = '100%';
    percentText.textContent = '100%';
    statusText.textContent = 'Package uploaded and validated!';
    showToast('Package validation complete!', report.valid ? 'success' : 'error');

    renderValidationResults(report);
  } catch (err: any) {
    statusText.textContent = 'Upload or validation failed.';
    showToast(err.message || 'Validation failed', 'error');
  }
}

function renderValidationResults(report: ValidationReport) {
  const container = document.getElementById('validationSection')!;
  container.style.display = 'block';

  const statusBadge = report.valid
    ? `<span style="background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 999px;"><i class="fa-solid fa-circle-check"></i> READY TO IMPORT</span>`
    : `<span style="background: #fee2e2; color: #b91c1c; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 999px;"><i class="fa-solid fa-triangle-exclamation"></i> VALIDATION FAILED</span>`;

  let tablesHtml = report.tableSummaries
    .map(
      (t) => `
      <tr style="border-bottom: 1px solid #f1f5f9; font-size: 13px;">
        <td style="padding: 10px 14px; font-weight: 700; color: #1e293b;">${escapeHtml(t.name)}</td>
        <td style="padding: 10px 14px; color: #64748b; font-family: monospace;">${escapeHtml(t.file)}</td>
        <td style="padding: 10px 14px; text-align: right; color: #334155;">${t.declaredCount.toLocaleString()}</td>
        <td style="padding: 10px 14px; text-align: right; color: #334155;">${t.parsedCount.toLocaleString()}</td>
        <td style="padding: 10px 14px; text-align: right; color: #16a34a; font-weight: 700;">${t.validCount.toLocaleString()}</td>
        <td style="padding: 10px 14px; text-align: right; color: ${t.invalidCount > 0 ? '#dc2626' : '#94a3b8'}; font-weight: 700;">${t.invalidCount}</td>
        <td style="padding: 10px 14px; text-align: center;">
          ${
            t.invalidCount === 0 && t.parsedCount > 0
              ? '<span style="color: #16a34a; font-size: 11px; font-weight: 800;">PASS</span>'
              : '<span style="color: #dc2626; font-size: 11px; font-weight: 800;">FAIL</span>'
          }
        </td>
      </tr>
    `,
    )
    .join('');

  let forbiddenHtml = '';
  if (report.forbiddenFieldsFound.length > 0) {
    forbiddenHtml = `
      <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 14px; margin-top: 16px;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: #b45309; margin-bottom: 8px;">
          <i class="fa-solid fa-shield"></i> Forbidden Security Fields Detected & Stripped:
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${report.forbiddenFieldsFound
            .map(
              (f) =>
                `<span style="background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-family: monospace;">
                  ${escapeHtml(f.table)}.${escapeHtml(f.field)} (${f.count})
                </span>`,
            )
            .join('')}
        </div>
      </div>
    `;
  }

  let errorsHtml = '';
  if (report.errors.length > 0) {
    errorsHtml = `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 14px; margin-top: 16px;">
        <div style="font-size: 13px; font-weight: 800; color: #dc2626; margin-bottom: 6px;">
          <i class="fa-solid fa-circle-exclamation"></i> Blocking Validation Errors:
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #991b1b; line-height: 1.5;">
          ${report.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="card" style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <h2 style="font-size: 18px; font-weight: 800; color: var(--color-neutral-900); margin: 0; display: flex; align-items: center; gap: 10px;">
          <span style="width: 28px; height: 28px; border-radius: 8px; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800;">2</span>
          Package Validation Report
        </h2>
        <div>${statusBadge}</div>
      </div>

      <!-- Manifest Meta -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 20px; font-size: 12px;">
        <div><strong>Export ID:</strong> <span style="font-family: monospace;">${escapeHtml(report.exportId)}</span></div>
        <div><strong>Source:</strong> <span>${escapeHtml(report.source)}</span></div>
        <div><strong>Format Version:</strong> <span>${escapeHtml(report.formatVersion)}</span></div>
        <div><strong>Exported At:</strong> <span>${new Date(report.exportedAt).toLocaleString()}</span></div>
        <div><strong>FK Integrity:</strong> <span style="color: ${report.foreignKeyCheck.status === 'PASS' ? '#16a34a' : '#dc2626'}; font-weight: 700;">${report.foreignKeyCheck.status}</span></div>
      </div>

      <!-- Table Details -->
      <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
              <th style="padding: 10px 14px;">Entity Table</th>
              <th style="padding: 10px 14px;">File</th>
              <th style="padding: 10px 14px; text-align: right;">Declared</th>
              <th style="padding: 10px 14px; text-align: right;">Parsed</th>
              <th style="padding: 10px 14px; text-align: right;">Valid</th>
              <th style="padding: 10px 14px; text-align: right;">Invalid</th>
              <th style="padding: 10px 14px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${tablesHtml}
          </tbody>
        </table>
      </div>

      ${forbiddenHtml}
      ${errorsHtml}

      ${
        report.valid
          ? `
          <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
            <button type="button" id="proceedToPreviewBtn" class="btn-primary-action" style="padding: 10px 24px; font-size: 14px; font-weight: 800; background: #dc2626;">
              Proceed to Preview & Mode Selection <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        `
          : ''
      }
    </div>
  `;

  if (report.valid) {
    document.getElementById('proceedToPreviewBtn')?.addEventListener('click', () => {
      fetchPreview('MERGE');
    });
  }
}

async function fetchPreview(mode: 'REPLACE' | 'MERGE') {
  if (!currentValidation) return;
  selectedMode = mode;

  try {
    const preview = await previewDataImport({
      packageToken: currentValidation.packageToken,
      mode,
    });
    currentPreview = preview;
    renderPreviewSection(preview);
  } catch (err: any) {
    showToast(err.message || 'Failed to load preview', 'error');
  }
}

function renderPreviewSection(preview: PreviewReport) {
  const container = document.getElementById('previewSection')!;
  container.style.display = 'block';

  container.innerHTML = `
    <div class="card" style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
      <h2 style="font-size: 18px; font-weight: 800; color: var(--color-neutral-900); margin: 0 0 16px 0; display: flex; align-items: center; gap: 10px;">
        <span style="width: 28px; height: 28px; border-radius: 8px; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800;">3</span>
        Import Preview & Mode Selection
      </h2>

      <!-- Mode Selector -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
        
        <!-- MERGE Card -->
        <div id="modeCardMerge" style="border: 2px solid ${preview.mode === 'MERGE' ? '#dc2626' : '#e2e8f0'}; background: ${preview.mode === 'MERGE' ? '#fef2f2' : '#fff'}; border-radius: 16px; padding: 20px; cursor: pointer; transition: all 0.2s ease;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="radio" id="modeRadioMerge" name="importMode" value="MERGE" ${preview.mode === 'MERGE' ? 'checked' : ''} style="cursor: pointer;" />
              <label for="modeRadioMerge" style="font-size: 15px; font-weight: 800; color: #1e293b; cursor: pointer;">
                MERGE MODE (Recommended)
              </label>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: #16a34a; background: #dcfce7; padding: 2px 8px; border-radius: 999px;">Safe</span>
          </div>
          <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
            Preserves all existing QA test data. Merges production-derived records with safe ID mapping. Identical records are skipped or updated non-destructively.
          </p>
        </div>

        <!-- REPLACE QA Card -->
        <div id="modeCardReplace" style="border: 2px solid ${preview.mode === 'REPLACE' ? '#dc2626' : '#e2e8f0'}; background: ${preview.mode === 'REPLACE' ? '#fef2f2' : '#fff'}; border-radius: 16px; padding: 20px; cursor: pointer; transition: all 0.2s ease;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="radio" id="modeRadioReplace" name="importMode" value="REPLACE" ${preview.mode === 'REPLACE' ? 'checked' : ''} style="cursor: pointer;" />
              <label for="modeRadioReplace" style="font-size: 15px; font-weight: 800; color: #dc2626; cursor: pointer;">
                REPLACE QA DATA
              </label>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: #dc2626; background: #fee2e2; padding: 2px 8px; border-radius: 999px;">Destructive</span>
          </div>
          <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
            Purges existing QA business records (reviews, usages, earnings, subscriptions, plans, messes, students) and replaces with this sanitized snapshot. Current admin user session is preserved.
          </p>
        </div>

      </div>

      <!-- Estimated Record Counts Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Users</div>
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${preview.estimatedCounts.users.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Providers</div>
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${preview.estimatedCounts.providers.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Meal Plans</div>
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${preview.estimatedCounts.mealPlans.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Subscriptions</div>
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${preview.estimatedCounts.subscriptions.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Meal Usage</div>
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${preview.estimatedCounts.mealUsages.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Reviews</div>
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${preview.estimatedCounts.reviews.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Earnings</div>
          <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${preview.estimatedCounts.providerEarnings.toLocaleString()}</div>
        </div>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #1e40af; font-weight: 700;">Total Records</div>
          <div style="font-size: 22px; font-weight: 800; color: #1e3a8a; margin-top: 4px;">${preview.estimatedCounts.total.toLocaleString()}</div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; justify-content: flex-end; gap: 12px; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 18px;">
        <span style="font-size: 13px; color: #64748b;">
          Selected Mode: <strong style="color: ${preview.mode === 'REPLACE' ? '#dc2626' : '#15803d'};">${preview.mode}</strong>
        </span>
        <button type="button" id="openConfirmationBtn" class="btn-primary-action" style="padding: 10px 26px; font-size: 14px; font-weight: 800; background: ${preview.mode === 'REPLACE' ? '#dc2626' : '#16a34a'};">
          <i class="fa-solid fa-play"></i> Initiate ${preview.mode} Import...
        </button>
      </div>
    </div>
  `;

  document.getElementById('modeCardMerge')?.addEventListener('click', () => {
    if (selectedMode !== 'MERGE') fetchPreview('MERGE');
  });

  document.getElementById('modeCardReplace')?.addEventListener('click', () => {
    if (selectedMode !== 'REPLACE') fetchPreview('REPLACE');
  });

  document.getElementById('openConfirmationBtn')?.addEventListener('click', () => {
    openConfirmationModal(preview);
  });
}

function openConfirmationModal(preview: PreviewReport) {
  const modal = document.getElementById('confirmationModal')!;
  const title = document.getElementById('confirmModalTitle')!;
  const badge = document.getElementById('confirmModalBadge')!;
  const desc = document.getElementById('confirmModalDesc')!;
  const phraseDisplay = document.getElementById('requiredPhraseDisplay')!;
  const input = document.getElementById('confirmPhraseInput') as HTMLInputElement;
  const proceedBtn = document.getElementById('proceedExecuteBtn') as HTMLButtonElement;

  input.value = '';
  proceedBtn.disabled = true;
  proceedBtn.style.opacity = '0.5';
  proceedBtn.style.cursor = 'not-allowed';

  phraseDisplay.textContent = preview.requiredConfirmationPhrase;

  if (preview.mode === 'REPLACE') {
    title.textContent = 'Confirm REPLACE QA Import';
    badge.textContent = 'MODE: REPLACE QA (DESTRUCTIVE)';
    badge.style.color = '#dc2626';
    desc.innerHTML = `
      <strong style="color: #dc2626;">WARNING:</strong> This will delete existing QA messes, students, subscriptions, and meal records and replace them with the ${preview.estimatedCounts.total.toLocaleString()} sanitized records from package <code>${escapeHtml(preview.exportId)}</code>.
    `;
  } else {
    title.textContent = 'Confirm MERGE QA Import';
    badge.textContent = 'MODE: MERGE (SAFE)';
    badge.style.color = '#16a34a';
    desc.innerHTML = `
      This will merge ${preview.estimatedCounts.total.toLocaleString()} records from package <code>${escapeHtml(preview.exportId)}</code> into QA, keeping existing QA records intact.
    `;
  }

  modal.style.display = 'flex';
  input.focus();
}

async function startExecution() {
  if (!currentValidation || !currentPreview) return;

  const executionSection = document.getElementById('executionSection')!;
  executionSection.style.display = 'block';

  executionSection.innerHTML = `
    <div class="card" style="background: #fff; border: 1px solid var(--color-neutral-200); border-radius: 20px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
      <h2 style="font-size: 18px; font-weight: 800; color: var(--color-neutral-900); margin: 0 0 16px 0; display: flex; align-items: center; gap: 10px;">
        <span style="width: 28px; height: 28px; border-radius: 8px; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800;">4</span>
        Executing Import (${selectedMode} MODE)...
      </h2>

      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; margin-bottom: 8px;">
          <span id="execStageText">Initializing transactional import...</span>
          <span id="execPercentText">5%</span>
        </div>
        <div style="width: 100%; height: 12px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
          <div id="execProgressBar" style="width: 5%; height: 100%; background: #dc2626; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <div id="execLiveDetails" style="font-size: 12px; color: #64748b; line-height: 1.5;">
        Performing database transaction safety checks...
      </div>
    </div>
  `;

  // Start polling progress
  const token = currentValidation.packageToken;
  progressInterval = setInterval(async () => {
    try {
      const p = await getDataImportProgress(token);
      const bar = document.getElementById('execProgressBar');
      const pText = document.getElementById('execPercentText');
      const sText = document.getElementById('execStageText');
      if (bar) bar.style.width = `${p.percent}%`;
      if (pText) pText.textContent = `${p.percent}%`;
      if (sText) sText.textContent = p.stage;
    } catch {}
  }, 500);

  try {
    const result = await executeDataImport({
      packageToken: token,
      mode: selectedMode,
      confirmationPhrase: currentPreview.requiredConfirmationPhrase,
    });

    clearInterval(progressInterval);
    showToast('Import completed successfully!', 'success');
    renderCompletionReport(result);
    loadImportHistory();
  } catch (err: any) {
    clearInterval(progressInterval);
    showToast(err.message || 'Import failed', 'error');
    renderExecutionFailure(err.message);
    loadImportHistory();
  }
}

function renderCompletionReport(result: ExecutionReport) {
  const container = document.getElementById('executionSection')!;
  container.innerHTML = `
    <div class="card" style="background: #fff; border: 1px solid #86efac; border-radius: 20px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <h2 style="font-size: 20px; font-weight: 800; color: #166534; margin: 0; display: flex; align-items: center; gap: 10px;">
          <i class="fa-solid fa-circle-check" style="font-size: 24px; color: #16a34a;"></i>
          Data Import Successfully Completed
        </h2>
        <span style="font-size: 12px; font-weight: 800; color: #15803d; background: #dcfce7; padding: 4px 12px; border-radius: 999px;">
          ${result.mode} MODE • ${result.durationMs}ms
        </span>
      </div>

      <!-- Metric Highlights -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px;">
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #166534; font-weight: 700;">Inserted</div>
          <div style="font-size: 24px; font-weight: 800; color: #15803d; margin-top: 4px;">${result.insertedCount.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Updated</div>
          <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px;">${result.updatedCount.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Skipped</div>
          <div style="font-size: 24px; font-weight: 800; color: #64748b; margin-top: 4px;">${result.skippedCount.toLocaleString()}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #64748b; font-weight: 700;">Conflicts</div>
          <div style="font-size: 24px; font-weight: 800; color: ${result.conflictCount > 0 ? '#dc2626' : '#64748b'}; margin-top: 4px;">${result.conflictCount.toLocaleString()}</div>
        </div>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #1e40af; font-weight: 700;">Fields Sanitized</div>
          <div style="font-size: 24px; font-weight: 800; color: #1e3a8a; margin-top: 4px;">${result.sanitizedCount.toLocaleString()}</div>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 14px; text-align: center;">
          <div style="font-size: 11px; color: #b45309; font-weight: 700;">Forbidden Excluded</div>
          <div style="font-size: 24px; font-weight: 800; color: #92400e; margin-top: 4px;">${result.forbiddenFieldsCount.toLocaleString()}</div>
        </div>
      </div>

      <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px;">
        <strong>Import Reference:</strong> <code>${escapeHtml(result.importId)}</code> • 
        <strong>Export ID:</strong> <code>${escapeHtml(result.exportId)}</code> •
        <strong>Completed:</strong> ${new Date(result.completedAt).toLocaleString()}
      </div>
    </div>
  `;
}

function renderExecutionFailure(errMsg: string) {
  const container = document.getElementById('executionSection')!;
  container.innerHTML = `
    <div class="card" style="background: #fff; border: 1px solid #fca5a5; border-radius: 20px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <i class="fa-solid fa-circle-xmark" style="font-size: 28px; color: #dc2626;"></i>
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #991b1b; margin: 0;">
            Import Failed & Rolled Back
          </h2>
          <span style="font-size: 12px; color: #dc2626;">Zero QA records were corrupted or left in a partial state.</span>
        </div>
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; font-size: 13px; color: #991b1b; line-height: 1.5;">
        <strong>Error Reason:</strong><br />
        ${escapeHtml(errMsg)}
      </div>
    </div>
  `;
}

async function loadImportHistory() {
  const container = document.getElementById('historyTableContainer')!;
  try {
    const res = await getDataImportHistory({ limit: 20, offset: 0 });
    if (!res.items || res.items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: #94a3b8;">
          <i class="fa-solid fa-box-archive" style="font-size: 32px; margin-bottom: 8px; display: block;"></i>
          <p style="font-size: 13px; margin: 0;">No production imports have been executed yet.</p>
        </div>
      `;
      return;
    }

    const rows = res.items
      .map((item) => {
        const isSuccess = item.status === 'COMPLETED';
        const statusBadge = isSuccess
          ? `<span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 999px;">COMPLETED</span>`
          : `<span style="background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 999px;">${escapeHtml(item.status)}</span>`;

        return `
        <tr style="border-bottom: 1px solid #f1f5f9; font-size: 12px;">
          <td style="padding: 12px 14px; font-family: monospace; font-weight: 700; color: #0f172a;">${escapeHtml(item.importId)}</td>
          <td style="padding: 12px 14px;">
            <span style="font-weight: 700; color: ${item.mode === 'REPLACE' ? '#dc2626' : '#16a34a'};">${escapeHtml(item.mode)}</span>
          </td>
          <td style="padding: 12px 14px; color: #64748b;">${new Date(item.startedAt).toLocaleString()}</td>
          <td style="padding: 12px 14px; color: #334155;">${escapeHtml(item.initiatedBy)}</td>
          <td style="padding: 12px 14px; text-align: right; font-weight: 700; color: #15803d;">${item.insertedCount.toLocaleString()}</td>
          <td style="padding: 12px 14px; text-align: center;">${statusBadge}</td>
          <td style="padding: 12px 14px; text-align: center;">
            <button class="view-detail-btn btn-outline-action" data-id="${escapeHtml(item.id)}" style="padding: 4px 10px; font-size: 11px; font-weight: 700;">
              Details
            </button>
          </td>
        </tr>
      `;
      })
      .join('');

    container.innerHTML = `
      <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
              <th style="padding: 10px 14px;">Import ID</th>
              <th style="padding: 10px 14px;">Mode</th>
              <th style="padding: 10px 14px;">Date</th>
              <th style="padding: 10px 14px;">Initiated By</th>
              <th style="padding: 10px 14px; text-align: right;">Inserted</th>
              <th style="padding: 10px 14px; text-align: center;">Status</th>
              <th style="padding: 10px 14px; text-align: center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.view-detail-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) openDetailModal(id);
      });
    });
  } catch (err: any) {
    container.innerHTML = `<p style="color: #dc2626; font-size: 13px;">Error loading audit logs: ${escapeHtml(err.message)}</p>`;
  }
}

async function openDetailModal(id: string) {
  const modal = document.getElementById('auditDetailModal')!;
  const title = document.getElementById('modalTitle')!;
  const content = document.getElementById('modalContent')!;

  modal.style.display = 'flex';
  content.innerHTML = '<p style="color: #64748b;">Loading record details...</p>';

  try {
    const item = await getDataImportById(id);
    title.textContent = `Import Audit: ${item.importId}`;

    let tableBreakdownHtml = '';
    try {
      if (item.recordCountsJson) {
        const counts = JSON.parse(item.recordCountsJson);
        const entries = Object.entries(counts);
        if (entries.length > 0) {
          tableBreakdownHtml = `
            <h4 style="font-size: 13px; font-weight: 800; margin: 12px 0 6px 0; color: #0f172a;">Table Records Breakdown:</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
              ${entries.map(([tbl, cnt]) => `
                <span style="background: #e2e8f0; font-size: 11px; padding: 2px 8px; border-radius: 6px; font-family: monospace;">
                  ${escapeHtml(tbl)}: ${cnt}
                </span>
              `).join('')}
            </div>
          `;
        }
      }
    } catch {}

    content.innerHTML = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div><strong>Import ID:</strong> <span style="font-family: monospace;">${escapeHtml(item.importId)}</span></div>
          <div><strong>Export ID:</strong> <span style="font-family: monospace;">${escapeHtml(item.exportId)}</span></div>
          <div><strong>Mode:</strong> <strong>${escapeHtml(item.mode)}</strong></div>
          <div><strong>Status:</strong> <strong>${escapeHtml(item.status)}</strong></div>
          <div><strong>Initiated By:</strong> ${escapeHtml(item.initiatedBy)}</div>
          <div><strong>Started At:</strong> ${new Date(item.startedAt).toLocaleString()}</div>
          ${item.completedAt ? `<div><strong>Completed At:</strong> ${new Date(item.completedAt).toLocaleString()}</div>` : ''}
        </div>
      </div>

      ${tableBreakdownHtml}

      <h4 style="font-size: 13px; font-weight: 800; margin: 0 0 8px 0; color: #0f172a;">Metrics Summary:</h4>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; text-align: center;">
        <div style="background: #f0fdf4; padding: 8px; border-radius: 8px; border: 1px solid #bbf7d0;">
          <div style="font-size: 10px; color: #166534;">Inserted</div>
          <div style="font-size: 18px; font-weight: 800; color: #15803d;">${item.insertedCount}</div>
        </div>
        <div style="background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 10px; color: #64748b;">Updated</div>
          <div style="font-size: 18px; font-weight: 800; color: #334155;">${item.updatedCount}</div>
        </div>
        <div style="background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 10px; color: #64748b;">Skipped</div>
          <div style="font-size: 18px; font-weight: 800; color: #64748b;">${item.skippedCount}</div>
        </div>
        <div style="background: #eff6ff; padding: 8px; border-radius: 8px; border: 1px solid #bfdbfe;">
          <div style="font-size: 10px; color: #1e40af;">Sanitized Fields</div>
          <div style="font-size: 18px; font-weight: 800; color: #1e3a8a;">${item.sanitizedCount}</div>
        </div>
        <div style="background: #fffbeb; padding: 8px; border-radius: 8px; border: 1px solid #fef3c7;">
          <div style="font-size: 10px; color: #b45309;">Forbidden Fields</div>
          <div style="font-size: 18px; font-weight: 800; color: #92400e;">${item.forbiddenFieldsCount}</div>
        </div>
        <div style="background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 10px; color: #64748b;">Conflicts</div>
          <div style="font-size: 18px; font-weight: 800; color: ${item.conflictCount > 0 ? '#dc2626' : '#334155'};">${item.conflictCount}</div>
        </div>
      </div>

      ${
        item.errorSummary
          ? `
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-top: 12px; font-size: 12px; color: #dc2626;">
            <strong>Error Summary:</strong> ${escapeHtml(item.errorSummary)}
          </div>
        `
          : ''
      }
    `;
  } catch (err: any) {
    content.innerHTML = `<p style="color: #dc2626;">Error: ${escapeHtml(err.message)}</p>`;
  }
}
