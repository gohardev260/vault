// ── Vault Dashboard JS ─────────────────────────────────────────────────────

let passwords = [];
let editingId = null;

// ── Elements ───────────────────────────────────────────────────────────────
const pwList        = document.getElementById('pw-list');
const searchInput   = document.getElementById('search-input');
const formTitle     = document.getElementById('form-title');
const pwForm        = document.getElementById('pw-form');
const editIdField   = document.getElementById('edit-id');
const nameInput     = document.getElementById('account-name');
const pwInput       = document.getElementById('account-pw');
const saveBtn       = document.getElementById('save-btn');
const cancelBtn     = document.getElementById('cancel-btn');
const userEmail     = document.getElementById('user-email');
const logoutBtn     = document.getElementById('logout-btn');
const toastContainer = document.getElementById('toast-container');

// Generator elements
const genLen        = document.getElementById('gen-len');
const genLenVal     = document.getElementById('gen-len-val');
const genUpper      = document.getElementById('gen-upper');
const genLower      = document.getElementById('gen-lower');
const genNums       = document.getElementById('gen-nums');
const genSyms       = document.getElementById('gen-syms');
const fillGenBtn    = document.getElementById('fill-gen-btn');
const strengthFill  = document.getElementById('strength-fill');
const strengthLabel = document.getElementById('strength-label');
const togglePwVis   = document.getElementById('toggle-pw-vis');
const eyeOpen       = document.getElementById('eye-open');
const eyeClosed     = document.getElementById('eye-closed');

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error();
        const data = await res.json();
        userEmail.textContent = data.email;
    } catch {
        window.location.href = '/';
        return;
    }

    await loadPasswords();
    setupTabs();
    setupGenerator();
    setupForm();
    setupSettings();

    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            showToast('Signed Out', 'You have successfully logged out of your vault.', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        } catch {
            window.location.href = '/';
        }
    });
});

// ── Tabs ───────────────────────────────────────────────────────────────────
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
        });
    });
}

// ── Load passwords ─────────────────────────────────────────────────────────
async function loadPasswords() {
    try {
        const res = await fetch('/api/passwords');
        if (!res.ok) throw new Error();
        passwords = await res.json();
    } catch {
        passwords = [];
    }
    renderList();
}

// ── Render list ────────────────────────────────────────────────────────────
function renderList() {
    const query = searchInput.value.toLowerCase();
    const filtered = passwords.filter(p => p.account_name.toLowerCase().includes(query));

    if (filtered.length === 0) {
        pwList.innerHTML = `
            <div class="empty-state">
                <svg class="empty-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>${passwords.length === 0 ? 'No credentials saved yet' : 'No matching results'}</span>
            </div>`;
        return;
    }

    pwList.innerHTML = filtered.map(p => `
        <div class="pw-item ${editingId === p.id ? 'active' : ''}" data-id="${p.id}">
            <div class="pw-item-left">
                <div class="pw-item-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                    </svg>
                </div>
                <div>
                    <div class="pw-item-name">${esc(p.account_name)}</div>
                    <div class="pw-item-date">${formatDate(p.created_at)}</div>
                </div>
            </div>
            <div class="pw-item-actions">
                <button class="btn-icon copy-btn" data-pw="${esc(p.password)}" title="Copy Password">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="btn-icon edit-btn" data-id="${p.id}" title="Edit Entry">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-icon btn-icon-danger del-btn" data-id="${p.id}" title="Delete Entry">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');

    // Copy handlers
    pwList.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(btn.dataset.pw);
            showToast('Copied', 'Credential password copied to clipboard.', 'success');
        });
    });

    // Edit handlers
    pwList.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEdit(btn.dataset.id);
        });
    });

    // Delete handlers
    pwList.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Are you sure you want to permanently delete this credential?')) return;
            try {
                const res = await fetch(`/api/passwords/${btn.dataset.id}`, { method: 'DELETE' });
                if (res.ok) {
                    if (editingId === btn.dataset.id) resetForm();
                    await loadPasswords();
                    showToast('Deleted', 'Credential deleted from your vault.', 'success');
                } else {
                    showToast('Error', 'Failed to delete credential.', 'error');
                }
            } catch (err) {
                showToast('Error', err.message, 'error');
            }
        });
    });

    // Row click = edit
    pwList.querySelectorAll('.pw-item').forEach(row => {
        row.addEventListener('click', () => startEdit(row.dataset.id));
    });
}

// ── Form Setup ─────────────────────────────────────────────────────────────
function setupForm() {
    pwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const pw = pwInput.value;

        if (!name || !pw) return;

        saveBtn.disabled = true;
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';

        try {
            let res;
            if (editingId) {
                res = await fetch(`/api/passwords/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_name: name, password: pw })
                });
            } else {
                res = await fetch('/api/passwords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_name: name, password: pw })
                });
            }

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Request failed');
            }

            resetForm();
            await loadPasswords();
            showToast(
                editingId ? 'Credential Updated' : 'Credential Saved',
                editingId ? 'Successfully updated vault entry.' : 'Successfully saved new entry.',
                'success'
            );
        } catch (err) {
            showToast('Error Saving', err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    });

    cancelBtn.addEventListener('click', resetForm);
    searchInput.addEventListener('input', renderList);

    // Toggle password visibility
    togglePwVis.addEventListener('click', () => {
        const isHidden = pwInput.type === 'password';
        pwInput.type = isHidden ? 'text' : 'password';
        if (isHidden) {
            eyeOpen.style.display = 'none';
            eyeClosed.style.display = 'block';
        } else {
            eyeOpen.style.display = 'block';
            eyeClosed.style.display = 'none';
        }
    });
}

function startEdit(id) {
    const entry = passwords.find(p => p.id === id);
    if (!entry) return;

    editingId = id;
    formTitle.textContent = 'Edit Password';
    nameInput.value = entry.account_name;
    pwInput.value = entry.password;
    pwInput.type = 'text';
    editIdField.value = id;
    
    // Swap visibility icons to show state
    eyeOpen.style.display = 'none';
    eyeClosed.style.display = 'block';
    
    cancelBtn.style.display = 'block';
    saveBtn.textContent = 'Update';

    renderList(); // highlight active
    updateStrength();
}

function resetForm() {
    editingId = null;
    pwForm.reset();
    editIdField.value = '';
    formTitle.textContent = 'Add Password';
    cancelBtn.style.display = 'none';
    saveBtn.textContent = 'Save';
    pwInput.type = 'password';
    
    // Visibility back to hidden
    eyeOpen.style.display = 'block';
    eyeClosed.style.display = 'none';
    
    renderList();
    updateStrength();
}

// ── Generator ──────────────────────────────────────────────────────────────
function setupGenerator() {
    genLen.addEventListener('input', () => {
        genLenVal.textContent = genLen.value;
        updateStrength();
    });

    [genUpper, genLower, genNums, genSyms].forEach(cb => {
        cb.addEventListener('change', updateStrength);
    });

    fillGenBtn.addEventListener('click', () => {
        pwInput.value = generate();
        pwInput.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
        updateStrength();
        showToast('Password Generated', 'Secure string successfully loaded into input field.', 'info');
    });

    updateStrength();
}

function generate() {
    const len = parseInt(genLen.value);
    let chars = '';
    if (genUpper.checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (genLower.checked) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (genNums.checked)  chars += '0123456789';
    if (genSyms.checked)  chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz';

    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, v => chars[v % chars.length]).join('');
}

function updateStrength() {
    let poolSize = 0;
    if (genUpper.checked) poolSize += 26;
    if (genLower.checked) poolSize += 26;
    if (genNums.checked)  poolSize += 10;
    if (genSyms.checked)  poolSize += 27;
    if (poolSize === 0) poolSize = 26;

    const len = parseInt(genLen.value);
    const entropy = Math.floor(len * Math.log2(poolSize));

    let label, color, pct;
    if (entropy < 40)      { label = 'Weak';       color = '#e11d48'; pct = 20; }
    else if (entropy < 60) { label = 'Fair';       color = '#f59e0b'; pct = 40; }
    else if (entropy < 80) { label = 'Good';       color = '#84cc16'; pct = 60; }
    else if (entropy < 100){ label = 'Strong';     color = '#10b981'; pct = 80; }
    else                   { label = 'Excellent';  color = '#059669'; pct = 100; }

    strengthFill.style.width = pct + '%';
    strengthFill.style.backgroundColor = color;
    strengthLabel.textContent = label;
    strengthLabel.style.color = color;
}

// ── Settings Setup ─────────────────────────────────────────────────────────
function setupSettings() {
    const form = document.getElementById('change-pw-form');
    const submitBtn = document.getElementById('settings-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cur = document.getElementById('cur-pw').value;
        const newPw = document.getElementById('new-pw').value;
        const conf = document.getElementById('confirm-pw').value;

        if (newPw !== conf) {
            showToast('Validation Error', 'New passwords do not match.', 'error');
            return;
        }

        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Updating...';

        try {
            const res = await fetch('/api/settings/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: cur, new_password: newPw })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed');
            }
            showToast('Master Password Updated', 'Your main security credentials have been updated.', 'success');
            form.reset();
        } catch (err) {
            showToast('Update Failed', err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// ── Dynamic Custom Toast Notification System ───────────────────────────────
function showToast(title, desc, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    // Monochrome success/error/info SVGs
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg class="toast-icon" style="color:var(--danger)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
        iconSvg = `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-desc">${desc}</div>
        </div>
        <button class="toast-close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div class="toast-progress"></div>
    `;

    toastContainer.appendChild(toast);

    const progressBar = toast.querySelector('.toast-progress');
    const duration = 4000; // 4 seconds duration
    let start = null;

    function animateProgress(timestamp) {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        progressBar.style.width = remaining + '%';

        if (elapsed < duration) {
            requestAnimationFrame(animateProgress);
        } else {
            dismiss();
        }
    }

    requestAnimationFrame(animateProgress);

    function dismiss() {
        toast.style.animation = 'toastOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        setTimeout(() => {
            toast.remove();
        }, 200);
    }

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
}

// ── Helper functions ───────────────────────────────────────────────────────
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
