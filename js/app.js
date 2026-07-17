// js/app.js
// Main Application Controller for Vault Password Manager Dashboard

(async function () {
    /* ---------- Supabase Credentials Setup ---------- */
    let supabaseUrl = window.SUPABASE_URL;
    let supabaseKey = window.SUPABASE_ANON_KEY;

    const IS_PLACEHOLDER_URL = !supabaseUrl || supabaseUrl === "YOUR_SUPABASE_URL" || supabaseUrl.trim() === "";
    const IS_PLACEHOLDER_KEY = !supabaseKey || supabaseKey === "YOUR_SUPABASE_ANON_KEY" || supabaseKey.trim() === "";

    if (IS_PLACEHOLDER_URL || IS_PLACEHOLDER_KEY) {
        supabaseUrl = localStorage.getItem("vault_supabase_url");
        supabaseKey = localStorage.getItem("vault_supabase_anon_key");
    }

    let supabase = null;
    const setupModal = document.getElementById('setup-modal');
    const setupForm = document.getElementById('setup-form');

    function initSupabase() {
        if (supabaseUrl && supabaseKey && supabaseUrl !== "YOUR_SUPABASE_URL" && supabaseKey !== "YOUR_SUPABASE_ANON_KEY") {
            try {
                supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
                return true;
            } catch (e) {
                console.error("Failed to initialize Supabase client", e);
                return false;
            }
        }
        return false;
    }

    // Show setup modal if not configured
    if (!initSupabase()) {
        if (setupModal) {
            setupModal.classList.add('active');
            setupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const urlInput = document.getElementById('setup-url').value.trim();
                const keyInput = document.getElementById('setup-key').value.trim();
                localStorage.setItem("vault_supabase_url", urlInput);
                localStorage.setItem("vault_supabase_anon_key", keyInput);
                window.location.reload();
            });
        }
        return; // Halt further initialization
    }

    /* ---------- State Variables ---------- */
    let session = null;
    let cryptoKey = null;
    let passwordsList = []; // Stores the decrypted password entries in memory

    /* ---------- Authenticate Session ---------- */
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    session = currentSession;

    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Check if the cryptography key exists in localStorage
    const b64Key = localStorage.getItem('vault_key');
    if (!b64Key) {
        // If session key is lost, sign out and redirect to log in again
        await supabase.auth.signOut();
        window.location.href = 'index.html';
        return;
    }

    try {
        cryptoKey = await window.VaultCrypto.importKeyFromBase64(b64Key);
    } catch (e) {
        console.error("Failed to import cryptography key", e);
        await supabase.auth.signOut();
        window.location.href = 'index.html';
        return;
    }

    // Listen for sign-out events
    supabase.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT' || !newSession) {
            localStorage.removeItem('vault_key');
            window.location.href = 'index.html';
        }
    });

    /* ---------- UI Elements ---------- */
    const toastContainer = document.getElementById('toast-container');
    const sidebar = document.getElementById('sidebar');
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const panels = document.querySelectorAll('.panel');

    // Password Elements
    const pwTableBody = document.getElementById('pw-table-body');
    const searchInput = document.getElementById('search-input');
    const addPwBtn = document.getElementById('add-pw-btn');
    const logoutBtns = document.querySelectorAll('.logout-btn');

    // Modal Elements
    const pwModal = document.getElementById('pw-modal');
    const pwForm = document.getElementById('pw-form');
    const formTitle = document.getElementById('form-title');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const editIdInput = document.getElementById('edit-id');
    const accountNameInput = document.getElementById('account-name');
    const accountUsernameInput = document.getElementById('account-username');
    const accountPwInput = document.getElementById('account-pw');
    const togglePwVisBtn = document.getElementById('toggle-pw-vis');
    const fillGenBtn = document.getElementById('fill-gen-btn');

    // Generator Elements
    const genLenInput = document.getElementById('gen-len');
    const genLenVal = document.getElementById('gen-len-val');
    const genUpper = document.getElementById('gen-upper');
    const genLower = document.getElementById('gen-lower');
    const genNums = document.getElementById('gen-nums');
    const genSyms = document.getElementById('gen-syms');
    const strengthFill = document.getElementById('strength-fill');
    const strengthLabel = document.getElementById('strength-label');

    // Profile Elements
    const userEmailDisplay = document.getElementById('user-email');
    const changePwForm = document.getElementById('change-pw-form');
    const settingsSubmitBtn = document.getElementById('settings-submit');


    /* ---------- Profile Info Initialization ---------- */
    const userEmail = session.user.email;
    if (userEmailDisplay) userEmailDisplay.textContent = userEmail;

    // Populate Sidebar profile trigger & mobile avatar
    const profileEmailEl = document.getElementById('profile-display-email');
    const profileNameEl = document.getElementById('profile-display-name');
    const profileAvatarEl = document.querySelector('.profile-trigger .avatar');
    const mobileAvatarDisplay = document.getElementById('mobile-avatar-display');

    if (profileEmailEl) profileEmailEl.textContent = userEmail;
    if (profileNameEl) profileNameEl.textContent = userEmail.split('@')[0];
    if (profileAvatarEl) profileAvatarEl.textContent = userEmail.charAt(0).toUpperCase();
    if (mobileAvatarDisplay) mobileAvatarDisplay.textContent = userEmail.charAt(0).toUpperCase();

    // Profile Popover toggling
    const profileTrigger = document.getElementById('profile-menu-trigger');
    const mobileProfileTrigger = document.getElementById('mobile-profile-trigger');
    const profilePopover = document.getElementById('profile-popover-menu');

    if (profilePopover) {
        const togglePopover = (e) => {
            e.stopPropagation();
            profilePopover.classList.toggle('active');
        };

        if (profileTrigger) profileTrigger.addEventListener('click', togglePopover);
        if (mobileProfileTrigger) mobileProfileTrigger.addEventListener('click', togglePopover);

        // Hide popover when clicking anywhere else
        window.addEventListener('click', (e) => {
            const clickOnTrigger = (profileTrigger && profileTrigger.contains(e.target)) ||
                (mobileProfileTrigger && mobileProfileTrigger.contains(e.target));
            if (!clickOnTrigger && !profilePopover.contains(e.target)) {
                profilePopover.classList.remove('active');
            }
        });
    }

    // Popover Settings button click
    const popoverSettingsBtn = document.getElementById('popover-settings-btn');
    if (popoverSettingsBtn) {
        popoverSettingsBtn.addEventListener('click', () => {
            switchTab('profile');
            if (profilePopover) profilePopover.classList.remove('active');
        });
    }



    /* ---------- Tab Navigation ---------- */
    function switchTab(tabId) {
        // Deactivate all tabs and panels
        sidebarTabs.forEach(tab => tab.classList.remove('active'));

        panels.forEach(panel => panel.classList.remove('active'));

        // Activate matching tab and panel
        if (tabId === 'profile') {

            // Select profile tab button as active if it exists
            const profileTabBtn = document.querySelector('.sidebar-tab[data-tab="profile"]');
            if (profileTabBtn) profileTabBtn.classList.add('active');
            document.getElementById('panel-profile').classList.add('active');
        } else {
            const activeTab = document.querySelector(`.sidebar-tab[data-tab="${tabId}"]`);
            if (activeTab) activeTab.classList.add('active');
            document.getElementById(`panel-${tabId}`).classList.add('active');
        }
    }

    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.getAttribute('data-tab'));
        });
    });



    /* ---------- Toast System ---------- */
    function showToast(title, desc, type) {
        const toast = document.createElement('div');
        toast.className = 'toast';

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg class="toast-icon toast-icon-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        } else {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        }

        toast.innerHTML = `
            ${iconSvg}
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-desc">${desc}</div>
            </div>
            <button class="toast-close" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        toastContainer.appendChild(toast);

        const dismiss = () => { toast.remove(); };
        setTimeout(dismiss, 4000);
        toast.querySelector('.toast-close').addEventListener('click', dismiss);
    }

    /* ---------- Logout Flow ---------- */
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await supabase.auth.signOut();
            } catch (err) {
                showToast('Logout Error', err.message, 'error');
            }
        });
    });

    /* ---------- CRUD: Fetch & Decrypt Passwords ---------- */
    async function fetchPasswords() {
        try {
            const { data, error } = await supabase
                .from('passwords')
                .select('*')
                .order('pinned', { ascending: false })
                .order('updated_at', { ascending: false });

            if (error) throw error;

            passwordsList = [];
            for (let item of data) {
                // Decrypt password string client-side
                const decryptedValue = await window.VaultCrypto.decrypt(item.password, item.iv, cryptoKey);
                passwordsList.push({
                    ...item,
                    decryptedPassword: decryptedValue
                });
            }

            renderPasswords(passwordsList);
        } catch (err) {
            console.error("Fetch Error:", err);
            showToast('Database Error', 'Could not load credentials: ' + err.message, 'error');
        }
    }

    /* ---------- CRUD: Render Password Table ---------- */
    function renderPasswords(items) {
        pwTableBody.innerHTML = '';
        const tableContainer = document.getElementById('table-container');
        const emptyContainer = document.getElementById('empty-state-container');

        if (items.length === 0) {
            if (tableContainer) tableContainer.style.display = 'none';
            if (emptyContainer) emptyContainer.style.display = 'block';
            return;
        }

        if (tableContainer) tableContainer.style.display = '';
        if (emptyContainer) emptyContainer.style.display = 'none';

        items.forEach(item => {
            const tr = document.createElement('tr');

            // Format updated timestamp
            const dateObj = new Date(item.updated_at);
            const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

            tr.innerHTML = `
                <td>
                    <div class="col-account-name">
                        <button class="pin-row-btn ${item.pinned ? 'pinned' : ''}" data-id="${item.id}" data-pinned="${item.pinned}" title="${item.pinned ? 'Unpin' : 'Pin'}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="17" x2="12" y2="22"></line>
                                <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.48A2 2 0 0 1 15 9.28V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v4.28a2 2 0 0 1-.78 1.24l-2.78 3.48A2 2 0 0 0 5 15.24V17Z"></path>
                            </svg>
                        </button>
                        <span class="font-medium">${escapeHTML(item.account_name)}</span>
                    </div>
                </td>
                <td><span class="text-sec">${escapeHTML(item.username || '—')}</span></td>
                <td>
                    <div class="col-pw-field">
                        <span class="masked-pw" data-id="${item.id}">••••••••</span>
                        <button type="button" class="btn-icon toggle-row-pw-btn" data-id="${item.id}" title="Show Password">
                            <svg class="eye-open" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button type="button" class="btn-icon copy-row-pw-btn" data-id="${item.id}" title="Copy to Clipboard">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                </td>
                <td><span class="text-sec">${dateStr}</span></td>
                <td class="text-right">
                    <div class="row-actions">
                        <button class="btn-icon edit-row-btn" data-id="${item.id}" title="Edit Credentials">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                            </svg>
                        </button>
                        <button class="btn-icon btn-icon-danger delete-row-btn" data-id="${item.id}" title="Delete Record">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                </td>
            `;

            pwTableBody.appendChild(tr);
        });

        // Add Event Listeners for Dynamic Row Elements
        addTableActionListeners();
    }

    /* ---------- Table Row Actions ---------- */
    function addTableActionListeners() {
        // Pin/Unpin Actions
        document.querySelectorAll('.pin-row-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const isPinned = btn.getAttribute('data-pinned') === 'true';
                try {
                    const { error } = await supabase
                        .from('passwords')
                        .update({ pinned: !isPinned })
                        .eq('id', id);
                    if (error) throw error;
                    fetchPasswords();
                } catch (err) {
                    showToast('Pinning Error', err.message, 'error');
                }
            });
        });

        // Password Show/Hide Toggle
        document.querySelectorAll('.toggle-row-pw-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const maskedEl = document.querySelector(`span[data-id="${id}"]`);
                const item = passwordsList.find(x => x.id === id);

                if (!item) return;

                if (maskedEl.textContent === '••••••••') {
                    maskedEl.textContent = item.decryptedPassword;
                    maskedEl.className = 'plain-pw';
                    btn.innerHTML = `
                        <svg class="eye-closed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                            <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                            <line x1="2" y1="2" x2="22" y2="22"></line>
                        </svg>
                    `;
                    btn.title = "Hide Password";
                } else {
                    maskedEl.textContent = '••••••••';
                    maskedEl.className = 'masked-pw';
                    btn.innerHTML = `
                        <svg class="eye-open" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    `;
                    btn.title = "Show Password";
                }
            });
        });

        // Clipboard Copy Action
        document.querySelectorAll('.copy-row-pw-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const item = passwordsList.find(x => x.id === id);
                if (item) {
                    navigator.clipboard.writeText(item.decryptedPassword).then(() => {
                        showToast('Copied', 'Password copied to clipboard.', 'success');
                    }).catch(e => {
                        showToast('Copy Error', 'Clipboard access denied.', 'error');
                    });
                }
            });
        });

        // Edit Action
        document.querySelectorAll('.edit-row-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const item = passwordsList.find(x => x.id === id);
                if (item) {
                    openModal(item);
                }
            });
        });

        // Delete Action
        document.querySelectorAll('.delete-row-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (confirm("Are you sure you want to permanently delete this password record?")) {
                    try {
                        const { error } = await supabase
                            .from('passwords')
                            .delete()
                            .eq('id', id);
                        if (error) throw error;
                        showToast('Record Deleted', 'Password record removed successfully.', 'success');
                        fetchPasswords();
                    } catch (err) {
                        showToast('Deletion Error', err.message, 'error');
                    }
                }
            });
        });
    }

    /* ---------- Search / Filter ---------- */
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        if (!query) {
            renderPasswords(passwordsList);
            return;
        }

        const filtered = passwordsList.filter(item =>
            item.account_name.toLowerCase().includes(query) ||
            (item.username && item.username.toLowerCase().includes(query))
        );

        renderPasswords(filtered);
    });

    /* ---------- Modal Controls ---------- */
    function openModal(editItem = null) {
        pwForm.reset();
        evaluatePasswordStrength('');

        if (editItem) {
            // Edit mode: show options by default and show current credentials
            document.getElementById('gen-section').style.display = 'block';
            formTitle.textContent = 'Edit Password';
            editIdInput.value = editItem.id;
            accountNameInput.value = editItem.account_name;
            accountUsernameInput.value = editItem.username || '';
            accountPwInput.value = editItem.decryptedPassword;
            evaluatePasswordStrength(editItem.decryptedPassword);

            // Sync slider value to current password length (capped min: 8, max: 64)
            const currentLen = editItem.decryptedPassword.length;
            const sliderLen = Math.max(8, Math.min(64, currentLen));
            genLenInput.value = sliderLen;
            genLenVal.textContent = sliderLen;
        } else {
            // Add mode: show options by default, reset slider length, and auto-generate password
            document.getElementById('gen-section').style.display = 'block';
            formTitle.textContent = 'Add Password';
            editIdInput.value = '';

            genLenInput.value = 16;
            genLenVal.textContent = '16';
            genUpper.checked = true;
            genLower.checked = true;
            genNums.checked = true;
            genSyms.checked = true;

            const generated = generateRandomPassword();
            if (generated) {
                accountPwInput.value = generated;
                evaluatePasswordStrength(generated);
            }
        }

        pwModal.classList.add('active');
    }

    function closeModal() {
        pwModal.classList.remove('active');
        pwForm.reset();
    }

    addPwBtn.addEventListener('click', () => openModal());

    const fabAddBtn = document.getElementById('fab-add-btn');
    if (fabAddBtn) {
        fabAddBtn.addEventListener('click', () => openModal());
    }

    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Close modal on background click
    pwModal.addEventListener('click', (e) => {
        if (e.target === pwModal) closeModal();
    });

    /* ---------- Password Visibility Toggle in Modal ---------- */
    togglePwVisBtn.addEventListener('click', () => {
        const isHidden = accountPwInput.type === 'password';
        accountPwInput.type = isHidden ? 'text' : 'password';

        const eyeOpen = togglePwVisBtn.querySelector('#eye-open');
        const eyeClosed = togglePwVisBtn.querySelector('#eye-closed');

        if (eyeOpen && eyeClosed) {
            eyeOpen.style.display = isHidden ? 'none' : 'block';
            eyeClosed.style.display = isHidden ? 'block' : 'none';
        }
    });

    /* ---------- Password Visibility Toggles in Settings ---------- */
    const settingsToggleBtns = document.querySelectorAll('.toggle-settings-pw');
    settingsToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (!targetInput) return;

            const isHidden = targetInput.type === 'password';
            targetInput.type = isHidden ? 'text' : 'password';

            const eyeOpen = btn.querySelector('#eye-open');
            const eyeClosed = btn.querySelector('#eye-closed');

            if (eyeOpen && eyeClosed) {
                eyeOpen.style.display = isHidden ? 'none' : 'block';
                eyeClosed.style.display = isHidden ? 'block' : 'none';
            }
        });
    });

    /* ---------- Password Strength & Generator Flow ---------- */
    accountPwInput.addEventListener('input', () => {
        evaluatePasswordStrength(accountPwInput.value);
    });

    // Generate password in real-time as user changes inputs
    function updateRealtimeGenerator() {
        genLenVal.textContent = genLenInput.value;
        const generated = generateRandomPassword();
        if (generated) {
            accountPwInput.value = generated;
            evaluatePasswordStrength(generated);
        }
    }

    genLenInput.addEventListener('input', updateRealtimeGenerator);
    genUpper.addEventListener('change', updateRealtimeGenerator);
    genLower.addEventListener('change', updateRealtimeGenerator);
    genNums.addEventListener('change', updateRealtimeGenerator);
    genSyms.addEventListener('change', updateRealtimeGenerator);

    fillGenBtn.addEventListener('click', () => {
        const genSection = document.getElementById('gen-section');

        // Ensure options panel is visible
        if (genSection.style.display === 'none') {
            genSection.style.display = 'block';
        }

        const generated = generateRandomPassword();
        if (generated) {
            accountPwInput.value = generated;
            evaluatePasswordStrength(generated);
        }
    });

    function generateRandomPassword() {
        const len = parseInt(genLenInput.value);
        const useUpper = genUpper.checked;
        const useLower = genLower.checked;
        const useNums = genNums.checked;
        const useSyms = genSyms.checked;

        let charset = '';
        if (useUpper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (useLower) charset += 'abcdefghijklmnopqrstuvwxyz';
        if (useNums) charset += '0123456789';
        if (useSyms) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

        if (!charset) {
            showToast('Generator Config', 'Select at least one character set checkbox.', 'error');
            return '';
        }

        let password = '';
        const randBuffer = new Uint32Array(len);
        crypto.getRandomValues(randBuffer);

        for (let i = 0; i < len; i++) {
            password += charset[randBuffer[i] % charset.length];
        }
        return password;
    }

    function evaluatePasswordStrength(password) {
        let score = 0;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        if (password.length === 0) {
            strengthFill.style.width = '0%';
            strengthFill.style.backgroundColor = 'var(--border)';
            strengthLabel.textContent = 'None';
            strengthLabel.style.color = 'var(--text-muted)';
        } else if (score <= 3) {
            strengthFill.style.width = '33%';
            strengthFill.style.backgroundColor = 'var(--danger)';
            strengthLabel.textContent = 'Weak';
            strengthLabel.style.color = 'var(--danger)';
        } else if (score <= 5) {
            strengthFill.style.width = '66%';
            strengthFill.style.backgroundColor = '#f59e0b'; // amber
            strengthLabel.textContent = 'Medium';
            strengthLabel.style.color = '#f59e0b';
        } else {
            strengthFill.style.width = '100%';
            strengthFill.style.backgroundColor = '#16a34a'; // green
            strengthLabel.textContent = 'Strong';
            strengthLabel.style.color = '#16a34a';
        }
    }

    /* ---------- Save Password Form Submit ---------- */
    pwForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;

        const editId = editIdInput.value;
        const accountName = accountNameInput.value.trim();
        const username = accountUsernameInput.value.trim();
        const plainPassword = accountPwInput.value;

        try {
            // Encrypt password client-side using zero-knowledge engine
            const encryptedData = await window.VaultCrypto.encrypt(plainPassword, cryptoKey);

            if (editId) {
                // Update existing record
                const { error } = await supabase
                    .from('passwords')
                    .update({
                        account_name: accountName,
                        username: username,
                        password: encryptedData.ciphertext,
                        iv: encryptedData.iv,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editId);

                if (error) throw error;
                showToast('Record Updated', 'Credentials saved successfully.', 'success');
            } else {
                // Insert new record
                const { error } = await supabase
                    .from('passwords')
                    .insert({
                        user_id: session.user.id,
                        account_name: accountName,
                        username: username,
                        password: encryptedData.ciphertext,
                        iv: encryptedData.iv
                    });

                if (error) throw error;
                showToast('Record Saved', 'New credentials added to vault.', 'success');
            }

            closeModal();
            fetchPasswords();
        } catch (err) {
            showToast('Save Error', err.message, 'error');
        } finally {
            saveBtn.disabled = false;
        }
    });

    /* ---------- Change Master Password Flow (with Re-encryption) ---------- */
    changePwForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const curPw = document.getElementById('cur-pw').value;
        const newPw = document.getElementById('new-pw').value;
        const confirmPw = document.getElementById('confirm-pw').value;

        if (newPw !== confirmPw) {
            showToast('Change Password', 'New passwords do not match.', 'error');
            return;
        }

        settingsSubmitBtn.disabled = true;
        settingsSubmitBtn.textContent = 'Updating master key...';

        try {
            // 1. Verify old password matches current session decryption key
            const oldKeyVerify = await window.VaultCrypto.deriveKey(curPw, session.user.email);
            const oldB64Verify = await window.VaultCrypto.exportKeyToBase64(oldKeyVerify);
            const activeB64 = localStorage.getItem('vault_key');

            if (oldB64Verify !== activeB64) {
                showToast('Auth Error', 'Current master password entered is incorrect.', 'error');
                settingsSubmitBtn.disabled = false;
                settingsSubmitBtn.textContent = 'Update Password';
                return;
            }

            // 2. Derive new key from the new master password
            const newKey = await window.VaultCrypto.deriveKey(newPw, session.user.email);
            const newB64 = await window.VaultCrypto.exportKeyToBase64(newKey);

            // 3. Batch re-encrypt all existing credentials in memory
            showToast('Re-encrypting', 'Re-encrypting credentials with new master key...', 'info');
            const reEncryptPromises = [];

            for (let item of passwordsList) {
                const encrypted = await window.VaultCrypto.encrypt(item.decryptedPassword, newKey);
                reEncryptPromises.push(
                    supabase
                        .from('passwords')
                        .update({
                            password: encrypted.ciphertext,
                            iv: encrypted.iv,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', item.id)
                );
            }

            // Execute all updates
            await Promise.all(reEncryptPromises);

            // 4. Update the user login credentials in Supabase Auth
            const { error: authError } = await supabase.auth.updateUser({ password: newPw });
            if (authError) throw authError;

            // 5. Update local state key in localStorage
            localStorage.setItem('vault_key', newB64);
            cryptoKey = newKey;

            // Clear input fields
            changePwForm.reset();
            showToast('Success', 'Master password updated and credentials re-encrypted.', 'success');

            // Refresh decrypted passwords list view
            fetchPasswords();

        } catch (err) {
            console.error(err);
            showToast('Update Error', 'Failed to update credentials: ' + err.message, 'error');
        } finally {
            settingsSubmitBtn.disabled = false;
            settingsSubmitBtn.textContent = 'Update Password';
        }
    });


    /* ---------- Helpers ---------- */
    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* ---------- Main Init ---------- */
    // Initial fetch of password entries
    fetchPasswords();

})();
