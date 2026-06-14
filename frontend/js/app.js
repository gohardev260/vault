/* ============================================
   Vault Dashboard — Clean JavaScript
   ============================================ */

let passwords = [];
let editingId = null;

/* ---------- Elements ---------- */
const pwTableBody   = document.getElementById('pw-table-body');
const searchInput   = document.getElementById('search-input');
const formTitle     = document.getElementById('form-title');
const pwForm        = document.getElementById('pw-form');
const editIdField   = document.getElementById('edit-id');
const nameInput     = document.getElementById('account-name');
const usernameInput = document.getElementById('account-username');
const pwInput       = document.getElementById('account-pw');
const saveBtn       = document.getElementById('save-btn');
const cancelBtn     = document.getElementById('cancel-btn');
const userEmail     = document.getElementById('user-email');
const logoutBtn     = document.getElementById('logout-btn');
const toastContainer = document.getElementById('toast-container');

// Modal Elements
const pwModal       = document.getElementById('pw-modal');
const addPwBtn      = document.getElementById('add-pw-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

// Generator Elements
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

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', async () => {
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
    setupProfileDropdown();
    setupModalEvents();

    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            showToast('Signed Out', 'You have successfully logged out.', 'success');
            setTimeout(() => { window.location.href = '/'; }, 800);
        } catch {
            window.location.href = '/';
        }
    });
});

/* ---------- Tabs ---------- */
function setupTabs() {
    document.querySelectorAll('.sidebar-nav .sidebar-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-nav .sidebar-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
        });
    });
}

/* ---------- Load Passwords ---------- */
async function loadPasswords() {
    try {
        const res = await fetch('/api/passwords');
        if (!res.ok) throw new Error();
        passwords = await res.json();
    } catch {
        passwords = [];
    }
    renderTable();
}

/* ---------- Render Table ---------- */
function renderTable() {
    const query = searchInput.value.toLowerCase().trim();
    const filtered = passwords.filter(p => 
        p.account_name.toLowerCase().includes(query) || 
        (p.username && p.username.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        pwTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="empty-state">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <span>${passwords.length === 0 ? 'No credentials saved yet' : 'No matching results'}</span>
                    </div>
                </td>
            </tr>`;
        return;
    }

    pwTableBody.innerHTML = filtered.map(p => `
        <tr data-id="${p.id}">
            <td class="font-medium">${esc(p.account_name)}</td>
            <td>${esc(p.username || '—')}</td>
            <td>
                <div class="col-pw-field">
                    <span class="masked-pw" id="masked-${p.id}">••••••••</span>
                    <span class="plain-pw" id="plain-${p.id}" style="display:none">${esc(p.password)}</span>
                    <button class="btn-icon view-row-btn" data-id="${p.id}" title="Toggle Password Visibility">
                        <svg class="eye-open" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <svg class="eye-closed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                            <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                            <line x1="2" y1="2" x2="22" y2="22"></line>
                        </svg>
                    </button>
                    <button class="btn-icon copy-row-btn" data-pw="${esc(p.password)}" title="Copy Password">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
            </td>
            <td class="text-sec">${formatDate(p.updated_at || p.created_at)}</td>
            <td class="text-right">
                <div class="row-actions">
                    <button class="btn-icon edit-row-btn" data-id="${p.id}" title="Edit Entry">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon btn-icon-danger del-row-btn" data-id="${p.id}" title="Delete Entry">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Toggle Visibility
    pwTableBody.querySelectorAll('.view-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const masked = document.getElementById(`masked-${id}`);
            const plain = document.getElementById(`plain-${id}`);
            const openSvg = btn.querySelector('.eye-open');
            const closedSvg = btn.querySelector('.eye-closed');
            
            const isHidden = plain.style.display === 'none';
            plain.style.display = isHidden ? 'block' : 'none';
            masked.style.display = isHidden ? 'none' : 'block';
            openSvg.style.display = isHidden ? 'none' : 'block';
            closedSvg.style.display = isHidden ? 'block' : 'none';
        });
    });

    // Copy
    pwTableBody.querySelectorAll('.copy-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(btn.dataset.pw);
            showToast('Copied', 'Password copied to clipboard.', 'success');
        });
    });

    // Edit
    pwTableBody.querySelectorAll('.edit-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEdit(btn.dataset.id);
        });
    });

    // Delete
    pwTableBody.querySelectorAll('.del-row-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this credential permanently?')) return;
            try {
                const res = await fetch(`/api/passwords/${btn.dataset.id}`, { method: 'DELETE' });
                if (res.ok) {
                    await loadPasswords();
                    showToast('Deleted', 'Credential removed from vault.', 'success');
                } else {
                    showToast('Error', 'Failed to delete credential.', 'error');
                }
            } catch (err) {
                showToast('Error', err.message, 'error');
            }
        });
    });
}

/* ---------- Form ---------- */
function setupForm() {
    pwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const username = usernameInput.value.trim();
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
                    body: JSON.stringify({ account_name: name, username: username, password: pw })
                });
            } else {
                res = await fetch('/api/passwords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_name: name, username: username, password: pw })
                });
            }

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Request failed');
            }

            closeModal();
            resetForm();
            await loadPasswords();
            showToast(
                editingId ? 'Updated' : 'Saved',
                editingId ? 'Credential updated successfully.' : 'New credential saved.',
                'success'
            );
        } catch (err) {
            showToast('Error', err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    });

    searchInput.addEventListener('input', renderTable);

    // Toggle password visibility in modal
    togglePwVis.addEventListener('click', () => {
        const isHidden = pwInput.type === 'password';
        pwInput.type = isHidden ? 'text' : 'password';
        eyeOpen.style.display = isHidden ? 'none' : 'block';
        eyeClosed.style.display = isHidden ? 'block' : 'none';
    });
}

function startEdit(id) {
    const entry = passwords.find(p => p.id === id);
    if (!entry) return;

    editingId = id;
    formTitle.textContent = 'Edit Password';
    nameInput.value = entry.account_name;
    usernameInput.value = entry.username || '';
    pwInput.value = entry.password;
    pwInput.type = 'password';
    editIdField.value = id;
    eyeOpen.style.display = 'block';
    eyeClosed.style.display = 'none';
    saveBtn.textContent = 'Update';

    openModal();
    updateStrength();
}

function resetForm() {
    editingId = null;
    pwForm.reset();
    editIdField.value = '';
    formTitle.textContent = 'Add Password';
    saveBtn.textContent = 'Save';
    pwInput.type = 'password';
    eyeOpen.style.display = 'block';
    eyeClosed.style.display = 'none';
    updateStrength();
}

/* ---------- Modal Logic ---------- */
function setupModalEvents() {
    addPwBtn.addEventListener('click', () => {
        resetForm();
        openModal();
    });

    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    // Close modal on click overlay
    pwModal.addEventListener('click', (e) => {
        if (e.target === pwModal) {
            closeModal();
        }
    });
}

function openModal() {
    pwModal.classList.add('active');
}

function closeModal() {
    pwModal.classList.remove('active');
}

/* ---------- Generator ---------- */
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
        showToast('Generated', 'Secure password loaded into field.', 'info');
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

/* ---------- Settings ---------- */
function setupSettings() {
    const form = document.getElementById('change-pw-form');
    const submitBtn = document.getElementById('settings-submit');

    const toggleBtns = form.querySelectorAll('.toggle-settings-pw');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');

            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            eyeOpen.style.display = isHidden ? 'none' : 'block';
            eyeClosed.style.display = isHidden ? 'block' : 'none';
        });
    });

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
            showToast('Password Updated', 'Your master password has been changed.', 'success');
            form.reset();
        } catch (err) {
            showToast('Update Failed', err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

/* ---------- Toast (no animation) ---------- */
function showToast(title, desc, type) {
    const toast = document.createElement('div');
    toast.className = 'toast';

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg class="toast-icon toast-icon-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            <div class="toast-desc">${desc}</div>
        </div>
        <button class="toast-close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    toastContainer.appendChild(toast);

    const dismiss = () => { toast.remove(); };
    setTimeout(dismiss, 4000);
    toast.querySelector('.toast-close').addEventListener('click', dismiss);
}

/* ---------- Helpers ---------- */
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------- Profile Dropdown ---------- */
function setupProfileDropdown() {
    const trigger = document.getElementById('profile-trigger');
    const dropdown = document.getElementById('profile-dropdown');
    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== trigger) {
            dropdown.classList.remove('show');
        }
    });
}
