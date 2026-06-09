// ── Vault Dashboard JS ─────────────────────────────────────────────────────

let passwords = [];
let editingId = null;

// ── Elements ───────────────────────────────────────────────────────────────
const pwList      = document.getElementById('pw-list');
const searchInput = document.getElementById('search-input');
const formTitle   = document.getElementById('form-title');
const pwForm      = document.getElementById('pw-form');
const editIdField = document.getElementById('edit-id');
const nameInput   = document.getElementById('account-name');
const pwInput     = document.getElementById('account-pw');
const saveBtn     = document.getElementById('save-btn');
const cancelBtn   = document.getElementById('cancel-btn');
const formAlert   = document.getElementById('form-alert');
const userEmail   = document.getElementById('user-email');
const logoutBtn   = document.getElementById('logout-btn');

// Generator elements
const genLen      = document.getElementById('gen-len');
const genLenVal   = document.getElementById('gen-len-val');
const genUpper    = document.getElementById('gen-upper');
const genLower    = document.getElementById('gen-lower');
const genNums     = document.getElementById('gen-nums');
const genSyms     = document.getElementById('gen-syms');
const fillGenBtn  = document.getElementById('fill-gen-btn');
const strengthFill  = document.getElementById('strength-fill');
const strengthLabel = document.getElementById('strength-label');
const togglePwVis   = document.getElementById('toggle-pw-vis');

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();

    // Check auth
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
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
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
                <i data-lucide="lock" style="width:24px;height:24px"></i>
                <span>${passwords.length === 0 ? 'No saved passwords yet' : 'No matches'}</span>
            </div>`;
        lucide.createIcons();
        return;
    }

    pwList.innerHTML = filtered.map(p => `
        <div class="pw-item ${editingId === p.id ? 'active' : ''}" data-id="${p.id}">
            <div class="pw-item-left">
                <div class="pw-item-icon"><i data-lucide="key"></i></div>
                <div>
                    <div class="pw-item-name">${esc(p.account_name)}</div>
                    <div class="pw-item-date">${formatDate(p.created_at)}</div>
                </div>
            </div>
            <div class="pw-item-actions">
                <button class="btn-icon copy-btn" data-pw="${esc(p.password)}" title="Copy password">
                    <i data-lucide="copy" style="width:14px;height:14px"></i>
                </button>
                <button class="btn-icon edit-btn" data-id="${p.id}" title="Edit">
                    <i data-lucide="pencil" style="width:14px;height:14px"></i>
                </button>
                <button class="btn-icon del-btn" data-id="${p.id}" title="Delete">
                    <i data-lucide="trash-2" style="width:14px;height:14px;color:var(--danger)"></i>
                </button>
            </div>
        </div>
    `).join('');

    lucide.createIcons();

    // Copy handlers
    pwList.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(btn.dataset.pw);
            showFormAlert('Copied to clipboard', 'success');
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
            if (!confirm('Delete this password?')) return;
            const res = await fetch(`/api/passwords/${btn.dataset.id}`, { method: 'DELETE' });
            if (res.ok) {
                if (editingId === btn.dataset.id) resetForm();
                await loadPasswords();
                showFormAlert('Deleted', 'success');
            }
        });
    });

    // Row click = edit
    pwList.querySelectorAll('.pw-item').forEach(row => {
        row.addEventListener('click', () => startEdit(row.dataset.id));
    });
}

// ── Form ───────────────────────────────────────────────────────────────────
function setupForm() {
    pwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const pw = pwInput.value;

        if (!name || !pw) return;

        saveBtn.disabled = true;
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
                throw new Error(err.detail || 'Failed');
            }

            resetForm();
            await loadPasswords();
            showFormAlert(editingId ? 'Updated' : 'Saved', 'success');
        } catch (err) {
            showFormAlert(err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    });

    cancelBtn.addEventListener('click', resetForm);
    searchInput.addEventListener('input', renderList);

    // Toggle password visibility
    togglePwVis.addEventListener('click', () => {
        const isHidden = pwInput.type === 'password';
        pwInput.type = isHidden ? 'text' : 'password';
        togglePwVis.innerHTML = `<i data-lucide="${isHidden ? 'eye-off' : 'eye'}" style="width:16px;height:16px"></i>`;
        lucide.createIcons();
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
    togglePwVis.innerHTML = '<i data-lucide="eye" style="width:16px;height:16px"></i>';
    lucide.createIcons();
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
        togglePwVis.innerHTML = '<i data-lucide="eye-off" style="width:16px;height:16px"></i>';
        lucide.createIcons();
        updateStrength();
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
    if (entropy < 40)      { label = 'Weak';       color = '#ff4444'; pct = 20; }
    else if (entropy < 60) { label = 'Fair';       color = '#ffaa44'; pct = 40; }
    else if (entropy < 80) { label = 'Good';       color = '#88cc44'; pct = 60; }
    else if (entropy < 100){ label = 'Strong';     color = '#44cc88'; pct = 80; }
    else                   { label = 'Excellent';  color = '#44ffaa'; pct = 100; }

    strengthFill.style.width = pct + '%';
    strengthFill.style.background = color;
    strengthLabel.textContent = label;
    strengthLabel.style.color = color;
}

// ── Settings ───────────────────────────────────────────────────────────────
function setupSettings() {
    const form = document.getElementById('change-pw-form');
    const alert = document.getElementById('settings-alert');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cur = document.getElementById('cur-pw').value;
        const newPw = document.getElementById('new-pw').value;
        const conf = document.getElementById('confirm-pw').value;

        if (newPw !== conf) {
            alert.textContent = 'Passwords do not match';
            alert.className = 'alert alert-error';
            alert.style.display = 'block';
            return;
        }

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
            alert.textContent = 'Password updated successfully';
            alert.className = 'alert alert-success';
            alert.style.display = 'block';
            form.reset();
        } catch (err) {
            alert.textContent = err.message;
            alert.className = 'alert alert-error';
            alert.style.display = 'block';
        }
    });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showFormAlert(msg, type) {
    formAlert.textContent = msg;
    formAlert.className = `alert alert-${type}`;
    formAlert.style.display = 'block';
    if (type === 'success') {
        setTimeout(() => { formAlert.style.display = 'none'; }, 2500);
    }
}

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
