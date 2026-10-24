/**
 * Sadaneera Mahotsav - Main Application Logic (Portrait Edition)
 * Integrates Module 1 (Generator + Cropper + Checksum + Editable Vishisht Atithi + Portrait Themes), 
 * Module 2 (Super Admin / Admin RBAC + Master Card Content Settings), 
 * and Module 3 (Smart Record Regeneration on the fly).
 */

document.addEventListener('DOMContentLoaded', () => {
  // App State
  const state = {
    user: API.getCurrentUser(),
    activeTab: 'dashboard',
    masterSettings: null,
    form: {
      gender: 'male',
      title: 'श्री',
      name: '',
      about: '',
      badge: 'विशिष्ट अतिथि',
      theme: 'royal-gold',
      photoData: '',
      checksum: '',
      cardCode: 'SN-0001-XXXX'
    },
    // Scale for live preview (tuned for 720x1040 portrait card)
    previewScale: 0.58,
    recordsFilter: {
      search: '',
      theme: '',
      status: 'all', // include soft-deleted rows so their audit labels remain visible
      limit: 50,
      offset: 0
    }
  };

  // Default avatar SVG placeholder for preview before upload
  const DEFAULT_AVATAR = '/assets/avatar-placeholder.svg';
  state.form.photoData = DEFAULT_AVATAR;

  // Initialize Validator & Cropper
  const validator = new FormValidator();
  const cropperModal = new CropperManager({
    onCropComplete: (base64) => {
      state.form.photoData = base64;
      document.getElementById('photoThumbnail').src = base64;
      document.getElementById('photoUploadPlaceholder').style.display = 'none';
      document.getElementById('photoPreviewWrap').style.display = 'flex';
      validateAndUpdate();
      showToast('फ़ोटो क्रॉपिंग पूर्ण हुई (Photo cropped successfully)', 'success');
    }
  });

  // UI Element References
  const authDialog = document.getElementById('authDialog');
  const regenerateModal = document.getElementById('regenerateModal');
  const toastContainer = document.getElementById('toastContainer');

  // ==========================================================================
  // Helper: Toast Notifications
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    // Native <dialog> elements live in the browser's top layer. A toast attached
    // to the page body can therefore sit BEHIND a blurred modal and be invisible.
    // Put notifications inside the currently open dialog's card instead.
    const openDialog = Array.from(document.querySelectorAll('dialog[open]'))
      .reverse().find(dialog => dialog.getAttribute('aria-modal') === 'true' || dialog.open);
    const modalCard = openDialog?.querySelector('.dialog-card');
    let target = toastContainer;
    if (modalCard) {
      target = modalCard.querySelector('.modal-toast-stack');
      if (!target) {
        target = document.createElement('div');
        target.className = 'modal-toast-stack';
        Object.assign(target.style, {
          position: 'relative', zIndex: '2147483647', width: '100%',
          display: 'flex', flexDirection: 'column', gap: '8px',
          marginBottom: '10px'
        });
        modalCard.insertBefore(target, modalCard.firstChild);
      }
    }

    const iconNode = document.createElement('span');
    iconNode.textContent = icon;
    const messageNode = document.createElement('div');
    messageNode.textContent = String(message ?? 'अनपेक्षित त्रुटि');
    toast.append(iconNode, messageNode);
    if (modalCard) {
      toast.style.position = 'relative';
      toast.style.width = '100%';
      toast.style.maxWidth = 'none';
      toast.style.boxSizing = 'border-box';
      toast.style.whiteSpace = 'normal';
      toast.style.overflowWrap = 'anywhere';
    }
    target.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, type === 'error' ? 8000 : 4500);
  }
  window.showToast = showToast;

  // ==========================================================================
  // Master Card Content Settings (Super Admin Controlled)
  // ==========================================================================
  async function loadMasterSettings() {
    try {
      const res = await API.getCardContentSettings();
      if (res.success && res.settings) {
        state.masterSettings = res.settings;
        syncMasterSettingsToUI();
        renderLivePreview();
      }
    } catch (err) {
      console.warn('Could not load master settings:', err.message);
    }
  }

  function syncMasterSettingsToUI() {
    if (!state.masterSettings) return;
    const s = state.masterSettings;

    // Sync master settings form fields
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };

    setVal('settingsProgramName', s.program_name);
    setVal('settingsInvocation', s.invocation);
    setVal('settingsProgramSubtitle', s.program_subtitle);
    setVal('settingsInvitationMessage', s.invitation_message);
    setVal('settingsEventDate', s.event_date);
    setVal('settingsEventTime', s.event_time);
    setVal('settingsEventVenue', s.event_venue);
    setVal('settingsOrganizerName', s.organizer_name);
  }

  // Master Settings Form Submit Handler (Super Admin Only)
  document.getElementById('masterSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSaveMasterSettings');
    btn.disabled = true;
    btn.textContent = 'सहेजा जा रहा है...';

    try {
      const payload = {
        program_name: document.getElementById('settingsProgramName').value,
        invocation: document.getElementById('settingsInvocation').value,
        program_subtitle: document.getElementById('settingsProgramSubtitle').value,
        invitation_message: document.getElementById('settingsInvitationMessage').value,
        event_date: document.getElementById('settingsEventDate').value,
        event_time: document.getElementById('settingsEventTime').value,
        event_venue: document.getElementById('settingsEventVenue').value,
        organizer_name: document.getElementById('settingsOrganizerName').value
      };

      const res = await API.updateCardContentSettings(payload);
      state.masterSettings = res.settings;
      syncMasterSettingsToUI();
      renderLivePreview();
      showToast('मुख्य कार्ड सामग्री सफलतापूर्वक अपडेट की गई! सभी नए निमंत्रण पत्रों पर यह लागू होगी।', 'success');
    } catch (err) {
      showToast(err.message || 'सामग्री सहेजने में विफल', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 मुख्य कार्ड सामग्री सहेजें (Save Master Settings)';
    }
  });

  document.getElementById('btnPreviewMasterSettings')?.addEventListener('click', () => {
    switchTab('generator');
    showToast('कार्ड जेनरेटर में मुख्य सामग्री का पूर्वावलोकन देखें', 'info');
  });

  // ==========================================================================
  // Auth & Session Management
  // ==========================================================================
  function openLoginModal(isLogout = false) {
    const dialog = document.getElementById('authDialog');
    if (!dialog) return;

    const logoutBanner = document.getElementById('authLogoutBanner');
    if (logoutBanner) {
      logoutBanner.style.display = isLogout ? 'flex' : 'none';
    }

    dialog.classList.add('is-visible');
    dialog.setAttribute('open', '');
    try {
      if (!dialog.open) {
        dialog.showModal();
      }
    } catch (e) {}

    setTimeout(() => {
      document.getElementById('loginUsername')?.focus();
    }, 50);
  }

  function closeLoginModal() {
    const dialog = document.getElementById('authDialog');
    if (!dialog) return;
    dialog.classList.remove('is-visible');
    dialog.removeAttribute('open');
    try {
      if (dialog.open) dialog.close();
    } catch (e) {}
    const logoutBanner = document.getElementById('authLogoutBanner');
    if (logoutBanner) {
      logoutBanner.style.display = 'none';
    }
  }

  function hideSplash() {
    if (typeof window.__dismissSplash === 'function') {
      window.__dismissSplash();
    }
    const splash = document.getElementById('appSplashScreen');
    if (splash) {
      splash.dataset.dismissed = 'true';
      splash.classList.add('splash-hidden');
      splash.style.opacity = '0';
      setTimeout(() => {
        if (splash.dataset.dismissed === 'true') {
          splash.style.visibility = 'hidden';
          splash.style.pointerEvents = 'none';
        }
      }, 380);
    }
  }

  function showSplash() {
    if (typeof window.__showSplash === 'function') {
      window.__showSplash();
    }
    const splash = document.getElementById('appSplashScreen');
    if (splash) {
      splash.dataset.dismissed = 'false';
      splash.classList.remove('splash-hidden');
      splash.style.display = 'flex';
      splash.style.visibility = 'visible';
      splash.style.pointerEvents = 'all';
      splash.style.zIndex = '100000000';
      void splash.offsetHeight;
      splash.style.opacity = '1';
    }
  }

  async function checkAuth() {
    const token = API.getToken();
    const cachedUser = API.getCurrentUser();
    if (!token || !cachedUser) {
      document.body.classList.add('is-unauthenticated');
      const adminNavBtn = document.getElementById('navBtnAdmins');
      const settingsNavBtn = document.getElementById('navBtnSettings');
      if (adminNavBtn) adminNavBtn.style.display = 'none';
      if (settingsNavBtn) settingsNavBtn.style.display = 'none';

      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

      openLoginModal(false);
      hideSplash();
      return false;
    }

    try {
      // Validate session against server /api/auth/me
      const meData = await API.getMe();
      if (meData && meData.success && meData.user) {
        state.user = meData.user;
        API.setSession(token, meData.user);
        document.body.classList.remove('is-unauthenticated');
        closeLoginModal();
        updateHeaderUserUI();
        try { await loadMasterSettings(); } catch (_) {}
        switchTab(state.activeTab || 'dashboard');
        startCardChangeSync();
        if (typeof showInstallPromptOnce === 'function') {
          showInstallPromptOnce();
        }
        return true;
      } else {
        throw new Error('Invalid session response');
      }
    } catch (err) {
      console.warn('Session verification notice:', err.message);
      API.clearSession();
      state.user = null;
      document.body.classList.add('is-unauthenticated');
      openLoginModal(false);
      return false;
    } finally {
      // GUARANTEED: Splash screen NEVER stays stuck
      hideSplash();
    }
  }

  // Prevent Escape key or accidental dismissal of login modal when not logged in
  authDialog?.addEventListener('cancel', (e) => {
    if (!API.getToken() || !state.user) {
      e.preventDefault();
    }
  });

  function updateHeaderUserUI() {
    if (!state.user) return;
    document.getElementById('currentUserName').textContent = state.user.full_name;
    const roleTag = document.getElementById('currentUserRole');
    roleTag.textContent = state.user.role === 'superadmin' ? 'Super Admin' : 'Admin';
    roleTag.className = `role-tag ${state.user.role}`;

    // Super Admin Only Tabs: Admin Management & Master Settings
    const isSuper = state.user.role === 'superadmin';
    const adminNavBtn = document.getElementById('navBtnAdmins');
    const settingsNavBtn = document.getElementById('navBtnSettings');

    if (adminNavBtn) adminNavBtn.style.display = isSuper ? 'inline-flex' : 'none';
    if (settingsNavBtn) settingsNavBtn.style.display = isSuper ? 'inline-flex' : 'none';

    if (!isSuper && (state.activeTab === 'admins' || state.activeTab === 'settings')) {
      switchTab('generator');
    }
  }

  // Auth Dialog Form Handler — authentication errors stay INSIDE the login modal.
  const loginForm = document.getElementById('loginForm');
  const loginUsernameInput = document.getElementById('loginUsername');
  const loginPasswordInput = document.getElementById('loginPassword');

  function showLoginInlineError(message) {
    if (!loginForm) return;
    let errorBox = document.getElementById('loginInlineError');
    if (!errorBox) {
      errorBox = document.createElement('div');
      errorBox.id = 'loginInlineError';
      errorBox.setAttribute('role', 'alert');
      errorBox.setAttribute('aria-live', 'assertive');
      Object.assign(errorBox.style, {
        display: 'none', marginTop: '12px', padding: '10px 12px',
        border: '1px solid #dc2626', borderRadius: '8px',
        background: '#fef2f2', color: '#991b1b', fontSize: '0.92rem',
        lineHeight: '1.45', fontWeight: '600', overflowWrap: 'anywhere'
      });
      const submit = loginForm.querySelector('button[type="submit"]');
      if (submit) submit.insertAdjacentElement('afterend', errorBox);
      else loginForm.appendChild(errorBox);
    }
    errorBox.textContent = message || 'गलत यूज़रनेम या पासवर्ड। कृपया दोबारा जाँचें।';
    errorBox.style.display = 'block';
  }

  function clearLoginInlineError() {
    const errorBox = document.getElementById('loginInlineError');
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }
  }

  loginUsernameInput?.addEventListener('input', clearLoginInlineError);
  loginPasswordInput?.addEventListener('input', clearLoginInlineError);

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginInlineError();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'प्रमाणित किया जा रहा है...';
    }

    const username = loginUsernameInput?.value?.trim() || '';
    const password = loginPasswordInput?.value || '';

    try {
      const res = await API.login(username, password);
      state.user = res.user;
      document.body.classList.remove('is-unauthenticated');
      closeLoginModal();
      updateHeaderUserUI();
      try { await loadMasterSettings(); } catch (_) {}
      switchTab('dashboard');
      startCardChangeSync();
      showToast(`स्वागत है, ${res.user.full_name}!`, 'success');
      if (typeof showInstallPromptOnce === 'function') showInstallPromptOnce();

      // Reinitialize the app with the newly stored session so every panel
      // and dashboard widget starts from fresh server data after login.
      setTimeout(() => window.location.reload(), 350);
    } catch (err) {
      const rawMessage = String(err?.message || '');
      const isCredentialError = /invalid credentials|wrong password|incorrect password|unauthorized|401|गलत|पासवर्ड|प्रमाणित/i.test(rawMessage);
      showLoginInlineError(isCredentialError
        ? 'गलत यूज़रनेम या पासवर्ड (Wrong credentials)। कृपया सही जानकारी दर्ज करें।'
        : (rawMessage || 'लॉगिन नहीं हो सका। कृपया दोबारा प्रयास करें।'));
    } finally {
      hideSplash();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'लॉगिन करें (Sign In)';
      }
    }
  });

  // Immediate, Deterministic and Reliable Logout Implementation with Branded Sadanira Splash Transition
  let logoutTransitionTimer = null;

  function performLogout() {
    if (performLogout._running) return;
    performLogout._running = true;

    // 1. Full-screen existing Sadanira splash appears immediately covering complete viewport
    showSplash();

    // 2. Hide all protected elements and unauthenticated state immediately underneath splash
    document.body.classList.add('is-unauthenticated');
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

    // 3. Immediately invalidate session & reset user state
    try {
      API.clearSession();
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } catch (e) {
      console.warn('Logout network error ignored:', e);
    }
    state.user = null;
    if (cardSyncTimer) {
      clearInterval(cardSyncTimer);
      cardSyncTimer = null;
    }
    lastCardChangeSignature = null;

    // 4. Clear header UI immediately
    const nameEl = document.getElementById('currentUserName');
    if (nameEl) nameEl.textContent = 'लॉगिन नहीं';
    const roleEl = document.getElementById('currentUserRole');
    if (roleEl) {
      roleEl.textContent = '';
      roleEl.className = 'role-tag';
    }

    const adminNavBtn = document.getElementById('navBtnAdmins');
    const settingsNavBtn = document.getElementById('navBtnSettings');
    if (adminNavBtn) adminNavBtn.style.display = 'none';
    if (settingsNavBtn) settingsNavBtn.style.display = 'none';

    // 5. Close any secondary modals and reset login inputs
    try { document.getElementById('cropperModal')?.close(); } catch (e) {}
    try { document.getElementById('regenerateModal')?.close(); } catch (e) {}

    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';

    if (typeof hideInstallPrompt === 'function') {
      hideInstallPrompt(false);
    }

    // 6. Pre-position login modal underneath splash with logout confirmation banner
    openLoginModal(true);

    // 7. Subtle, smooth transition:
    // Splash displays full viewport for ~600ms, then smoothly fades out over 380ms,
    // seamlessly revealing the Login modal underneath with zero blank screen!
    if (logoutTransitionTimer) clearTimeout(logoutTransitionTimer);
    logoutTransitionTimer = setTimeout(() => {
      // Session has already been cleared. Reload into a clean unauthenticated
      // state so no previous user's dashboard data remains on screen.
      window.location.reload();
    }, 600);
  }

  // Expose to window for reliable direct onclick triggering
  window.performLogout = performLogout;

  // Logout Click Handler
  document.getElementById('btnLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    performLogout();
  });

  window.addEventListener('auth:expired', () => {
    showToast('आपका सत्र समाप्त हो चुका है। कृपया पुनः लॉगिन करें।', 'error');
    performLogout();
  });

  // ==========================================================================
  // Navigation Tabs Switching
  // ==========================================================================
  function switchTab(tabId) {
    if ((tabId === 'admins' || tabId === 'settings') && state.user?.role !== 'superadmin') {
      showToast('केवल मुख्य प्रशासक (Super Admin) को यह अनुमति है।', 'error');
      tabId = 'generator';
    }

    state.activeTab = tabId;

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-content').forEach(section => {
      section.classList.toggle('active', section.id === `tab-${tabId}`);
    });

    // Refresh content for the active tab
    if (tabId === 'dashboard') loadDashboard();
    if (tabId === 'records') loadRecords();
    if (tabId === 'admins') loadAdminsList();
    if (tabId === 'settings') syncMasterSettingsToUI();
    if (tabId === 'generator') {
      fitPreviewToContainer();
      renderLivePreview();
    }
  }

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ==========================================================================
  // Module 1: Form Inputs & Gender / Salutation Selector
  // ==========================================================================

  // Gender Option Buttons
  document.querySelectorAll('.gender-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedGender = btn.dataset.gender;
      setGenderAndTitle(selectedGender);
    });
  });

  // Title Pill Buttons
  document.querySelectorAll('.title-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const selectedTitle = pill.dataset.title;
      setTitleDirectly(selectedTitle);
    });
  });

  function setGenderAndTitle(gender) {
    state.form.gender = gender;

    document.querySelectorAll('.gender-option-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.gender === gender);
    });

    // Auto set appropriate Hindi honorific title based on gender requirement:
    // Shri for male, Smt for married female, Sushri for unmarried female
    if (gender === 'male') {
      state.form.title = 'श्री';
    } else if (gender === 'female_married') {
      state.form.title = 'श्रीमती';
    } else if (gender === 'female_unmarried') {
      state.form.title = 'सुश्री';
    }

    // Sync title pills
    document.querySelectorAll('.title-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.title === state.form.title);
    });

    validateAndUpdate();
  }

  function setTitleDirectly(title) {
    state.form.title = title;

    document.querySelectorAll('.title-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.title === title);
    });

    // Align gender selection accordingly
    if (title === 'श्री') state.form.gender = 'male';
    else if (title === 'श्रीमती') state.form.gender = 'female_married';
    else if (title === 'सुश्री') state.form.gender = 'female_unmarried';

    document.querySelectorAll('.gender-option-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.gender === state.form.gender);
    });

    validateAndUpdate();
  }

  // Inputs: Name, About, Editable Badge, Theme
  const inputGuestName = document.getElementById('inputGuestName');
  const inputGuestAbout = document.getElementById('inputGuestAbout');
  const inputGuestBadge = document.getElementById('inputGuestBadge');
  const selectTheme = document.getElementById('selectTheme');
  const inputEventDate = document.getElementById('inputEventDate');
  const inputEventTime = document.getElementById('inputEventTime');
  const inputEventVenue = document.getElementById('inputEventVenue');

  inputGuestName?.addEventListener('input', (e) => {
    state.form.name = e.target.value;
    validateAndUpdate();
  });

  inputGuestAbout?.addEventListener('input', (e) => {
    state.form.about = e.target.value;
    validateAndUpdate();
  });

  inputGuestBadge?.addEventListener('input', (e) => {
    state.form.badge = e.target.value;
    validateAndUpdate();
  });

  // Preset buttons for editable Vishisht Atithi badge
  document.querySelectorAll('.badge-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const badge = btn.dataset.badge;
      state.form.badge = badge;
      if (inputGuestBadge) inputGuestBadge.value = badge;
      validateAndUpdate();
    });
  });

  selectTheme?.addEventListener('change', (e) => {
    state.form.theme = e.target.value;
    renderLivePreview();
  });

  inputEventDate?.addEventListener('input', (e) => {
    state.form.eventDate = e.target.value;
    renderLivePreview();
  });

  inputEventTime?.addEventListener('input', (e) => {
    state.form.eventTime = e.target.value;
    renderLivePreview();
  });

  inputEventVenue?.addEventListener('input', (e) => {
    state.form.eventVenue = e.target.value;
    renderLivePreview();
  });

  // Photo Upload & Drop Zone
  const photoDropZone = document.getElementById('photoDropZone');
  const photoFileInput = document.getElementById('photoFileInput');

  photoDropZone?.addEventListener('click', (e) => {
    if (e.target.id === 'btnRecropPhoto' || e.target.id === 'btnRemovePhoto') return;
    photoFileInput.click();
  });

  photoFileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      cropperModal.loadImage(e.target.files[0]);
    }
  });

  photoDropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    photoDropZone.style.borderColor = 'var(--primary)';
  });

  photoDropZone?.addEventListener('dragleave', () => {
    photoDropZone.style.borderColor = '#d1c7b7';
  });

  photoDropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    photoDropZone.style.borderColor = '#d1c7b7';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      cropperModal.loadImage(e.dataTransfer.files[0]);
    }
  });

  document.getElementById('btnRecropPhoto')?.addEventListener('click', () => {
    if (state.form.photoData && state.form.photoData !== DEFAULT_AVATAR) {
      cropperModal.loadImage(state.form.photoData);
    } else {
      photoFileInput.click();
    }
  });

  document.getElementById('btnRemovePhoto')?.addEventListener('click', () => {
    state.form.photoData = DEFAULT_AVATAR;
    document.getElementById('photoPreviewWrap').style.display = 'none';
    document.getElementById('photoUploadPlaceholder').style.display = 'block';
    photoFileInput.value = '';
    validateAndUpdate();
  });

  // Scale Controls for Portrait Preview (720px wide x 1040px tall)
  function applyPreviewScale() {
    const scaler = document.getElementById('liveCardScaler');
    if (scaler) {
      scaler.style.transform = `scale(${state.previewScale})`;
      const originWidth = 720; // portrait card natural width
      const originHeight = 1040; // portrait card natural height
      const scaledHeight = originHeight * state.previewScale;
      const scaledWidth = originWidth * state.previewScale;
      scaler.style.height = `${originHeight}px`;
      scaler.style.marginBottom = `${-(originHeight - scaledHeight)}px`;
      // Bounding box compensation so 720px width never forces horizontal page overflow
      scaler.style.marginLeft = `${-(originWidth - scaledWidth) / 2}px`;
      scaler.style.marginRight = `${-(originWidth - scaledWidth) / 2}px`;
    }
    const indicator = document.getElementById('scaleIndicator');
    if (indicator) indicator.textContent = `${Math.round(state.previewScale * 100)}%`;
  }

  document.getElementById('btnZoomInPreview')?.addEventListener('click', () => {
    if (state.previewScale < 1.0) {
      state.previewScale = Math.min(1.0, state.previewScale + 0.06);
      applyPreviewScale();
    }
  });

  function fitPreviewToContainer(isManual = false) {
    const viewport = document.getElementById('previewViewport');
    if (!viewport) return;
    const padding = window.innerWidth <= 768 ? 16 : 48;
    const availWidth = Math.max(100, viewport.clientWidth - padding);
    if (availWidth > 40) {
      const fitScale = Math.min(0.85, Math.max(0.24, availWidth / 720));
      state.previewScale = Math.round(fitScale * 100) / 100;
      applyPreviewScale();
    }
  }

  document.getElementById('btnZoomOutPreview')?.addEventListener('click', () => {
    if (state.previewScale > 0.24) {
      state.previewScale = Math.max(0.24, state.previewScale - 0.05);
      applyPreviewScale();
    }
  });

  document.getElementById('btnFitPreview')?.addEventListener('click', () => {
    fitPreviewToContainer(true);
  });

  let resizeDebounce = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      if (state.activeTab === 'generator') {
        fitPreviewToContainer();
      }
    }, 120);
  });

  // Validation & Live Preview Re-rendering
  async function validateAndUpdate() {
    const s = state.masterSettings || {};
    const evalResult = await validator.evaluate({
      title: state.form.title,
      gender: state.form.gender,
      name: state.form.name,
      about: state.form.about,
      badge: state.form.badge,
      eventDate: s.event_date || '',
      eventVenue: s.event_venue || '',
      username: state.user?.username || 'USER',
      photoData: state.form.photoData !== DEFAULT_AVATAR ? state.form.photoData : ''
    });

    state.form.checksum = evalResult.checksum;
    validator.updateUI(evalResult);
    renderLivePreview();
  }

  function renderLivePreview() {
    const container = document.getElementById('liveCardContainer');
    if (!container) return;

    const s = state.masterSettings || {};

    CardRenderer.renderInto(container, {
      title: state.form.title,
      guestName: state.form.name.trim() || 'अतिथि महोदय का नाम',
      guestAbout: state.form.about.trim() || 'पद / परिचय / पता यहाँ प्रदर्शित होगा...',
      guestBadge: state.form.badge.trim() || 'विशिष्ट अतिथि',
      photoUrl: state.form.photoData,
      theme: state.form.theme,
      cardCode: state.form.cardCode,
      checksum: state.form.checksum || 'SN-CHECKSUM',
      programName: s.program_name,
      programSubtitle: s.program_subtitle,
      invocation: s.invocation,
      invitationMessage: s.invitation_message,
      eventDate: s.event_date,
      eventTime: s.event_time,
      eventVenue: s.event_venue,
      organizer: s.organizer_name
    });

    applyPreviewScale();
  }

  // ==========================================================================
  // Save & Record New Card in Database
  // ==========================================================================
  document.getElementById('btnSaveRecord')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveRecord');
    if (!btn || btn.disabled) return; // prevent duplicate submissions
    btn.disabled = true;
    btn.textContent = 'सहेजा जा रहा है...';

    let savedCard = null;
    let pngDownloaded = false;
    try {
      const s = state.masterSettings || {};
      const payload = {
        title: state.form.title,
        gender: state.form.gender,
        guest_name: state.form.name.trim(),
        guest_about: state.form.about.trim(),
        guest_badge: state.form.badge.trim() || 'विशिष्ट अतिथि',
        theme: state.form.theme,
        event_date: s.event_date || '',
        event_time: s.event_time || '',
        event_venue: s.event_venue || '',
        photo_base64: state.form.photoData,
        checksum: state.form.checksum
      };

      // The API success response confirms that the D1 record has been inserted.
      const res = await API.createCard(payload);
      if (!res?.success || !res?.card?.id) throw new Error(res?.message || 'कार्ड डेटाबेस में सेव होने की पुष्टि नहीं मिली।');
      savedCard = res.card;

      // Render and download before clearing the form, but don't misreport a saved
      // database record as a failed save if the browser blocks the PNG download.
      state.form.cardCode = savedCard.card_code;
      // Keep the full checksum in D1; only the card artwork gets the 8-character display.
      state.form.checksum = formatCardChecksum(savedCard.created_by_username || state.user?.username, savedCard.checksum || state.form.checksum);
      renderLivePreview();
      try {
        const cardNode = document.querySelector('#liveCardContainer .invitation-card');
        if (!cardNode) throw new Error('कार्ड पूर्वावलोकन तैयार नहीं हो सका।');
        const filename = `Sadaneera_Invitation_${(state.form.name || 'Card').replace(/[^a-zA-Z0-9_\u0900-\u097F-]+/g, '_')}.png`;
        await CardRenderer.exportPNG(cardNode, filename);
        pngDownloaded = true;
      } catch (downloadErr) {
        console.warn('Card was saved to D1, but PNG download failed:', downloadErr);
      }

      // Clear guest-specific fields after a confirmed save so the same click
      // cannot accidentally create the same card again. Keep the selected theme.
      state.form.name = '';
      state.form.about = '';
      state.form.badge = 'विशिष्ट अतिथि';
      state.form.photoData = DEFAULT_AVATAR;
      state.form.checksum = '';
      state.form.cardCode = 'SN-NEXT';
      inputGuestName.value = '';
      inputGuestAbout.value = '';
      if (inputGuestBadge) inputGuestBadge.value = 'विशिष्ट अतिथि';
      if (photoFileInput) photoFileInput.value = '';
      const photoWrap = document.getElementById('photoPreviewWrap');
      const photoPlaceholder = document.getElementById('photoUploadPlaceholder');
      const photoThumbnail = document.getElementById('photoThumbnail');
      if (photoThumbnail) photoThumbnail.src = DEFAULT_AVATAR;
      if (photoWrap) photoWrap.style.display = 'none';
      if (photoPlaceholder) photoPlaceholder.style.display = 'block';
      setGenderAndTitle('male');
      validateAndUpdate();
      renderLivePreview();
      await loadRecords();
      await loadDashboard();

      if (pngDownloaded) {
        showToast(`कार्ड ${savedCard.card_code} डेटाबेस में सेव हो गया और PNG मोबाइल/डिवाइस में डाउनलोड हो गया। फॉर्म खाली कर दिया गया है।`, 'success');
      } else {
        showToast(`कार्ड ${savedCard.card_code} डेटाबेस में सेव हो गया, लेकिन PNG डाउनलोड नहीं हो सका। फॉर्म खाली कर दिया गया है; रिकॉर्ड दोबारा न बनाएं।`, 'info');
      }
    } catch (err) {
      showToast(savedCard
        ? `कार्ड ${savedCard.card_code} डेटाबेस में सेव है, लेकिन बाद का चरण पूरा नहीं हुआ: ${err.message}`
        : (err.message || 'कार्ड सहेजने में विफल'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 सहेजें व कोड उत्पन्न करें (Save to Records)';
    }
  });

  // Direct PNG / PDF Download from Generator
  document.getElementById('btnDownloadPng')?.addEventListener('click', async () => {
    const cardNode = document.querySelector('#liveCardContainer .invitation-card');
    if (!cardNode) return;
    try {
      const filename = `Sadaneera_Invitation_${(state.form.name || 'Card').replace(/[^a-zA-Z0-9_\u0900-\u097F-]+/g, '_')}.png`;
      await CardRenderer.exportPNG(cardNode, filename);
      showToast('निमंत्रण पत्र PNG डाउनलोड हो गया है', 'success');
    } catch (err) {
      showToast(err.message || 'PNG डाउनलोड नहीं हो सका', 'error');
    }
  });

  document.getElementById('btnDownloadPdf')?.addEventListener('click', async () => {
    const cardNode = document.querySelector('#liveCardContainer .invitation-card');
    if (!cardNode) return;
    try {
      const filename = `Sadaneera_Invitation_${(state.form.name || 'Card').replace(/[^a-zA-Z0-9_\u0900-\u097F-]+/g, '_')}.pdf`;
      await CardRenderer.exportPDF(cardNode, filename);
      showToast('निमंत्रण पत्र PDF डाउनलोड हो गया है', 'success');
    } catch (err) {
      showToast(err.message || 'PDF डाउनलोड नहीं हो सका', 'error');
    }
  });

  // Reset Generator Form
  document.getElementById('btnResetForm')?.addEventListener('click', () => {
    if (!confirm('क्या आप फॉर्म के सभी फ़ील्ड रीसेट करना चाहते हैं?')) return;
    state.form.name = '';
    state.form.about = '';
    state.form.badge = 'विशिष्ट अतिथि';
    state.form.photoData = DEFAULT_AVATAR;
    state.form.cardCode = 'SN-0001-XXXX';
    inputGuestName.value = '';
    inputGuestAbout.value = '';
    if (inputGuestBadge) inputGuestBadge.value = 'विशिष्ट अतिथि';
    photoFileInput.value = '';
    document.getElementById('photoPreviewWrap').style.display = 'none';
    document.getElementById('photoUploadPlaceholder').style.display = 'block';
    setGenderAndTitle('male');
    showToast('फॉर्म रीसेट कर दिया गया', 'info');
  });

  // ==========================================================================
  // Display only 8 characters: creator username prefix (4) + first 4 hash characters.
  // The full canonical checksum remains stored in D1 and is not truncated in storage.
  function formatCardChecksum(username, checksum) {
    const value = String(checksum || 'N/A').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return value.slice(0, 8);
  }

  // Module 3: Records Table & On-the-fly Regeneration
  // ==========================================================================
  async function loadRecords() {
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">लोड हो रहा है...</td></tr>`;

    try {
      const res = await API.getCards({ ...state.recordsFilter, status: 'all' });
      renderRecordsTable(res.cards || []);
      document.getElementById('totalRecordsBadge').textContent = `${res.total || 0} निमंत्रण कार्ड`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger); padding: 1.5rem;">त्रुटि: ${err.message}</td></tr>`;
    }
  }

  function renderRecordsTable(cards) {
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;

    if (cards.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">कोई रिकॉर्ड उपलब्ध नहीं है। कृपया कार्ड जेनरेटर से नया निमंत्रण बनाएं।</td></tr>`;
      return;
    }

    tbody.innerHTML = cards.map(c => {
      const photoSrc = c.photo_url || DEFAULT_AVATAR;
      const shortHash = formatCardChecksum(c.created_by_username, c.checksum);
      const createdDate = new Date(c.created_at).toLocaleDateString('hi-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
      const badgeLabel = c.guest_badge || 'विशिष्ट अतिथि';
      const deleted = Number(c.is_deleted) === 1;
      const deletedBy = c.deleted_by_name ? `डिलीट बाय: ${c.deleted_by_name}` : 'डिलीट बाय: मुख्य प्रशासन';

      const isSuperAdmin = state.user?.role === 'superadmin';
      const isOwnCard = Number(c.created_by_id) === Number(state.user?.id);
      const canDeleteCard = isSuperAdmin || isOwnCard;
      const actionButtons = deleted
        ? `<div class="deleted-action-label"><strong>🗑️ डिलीटेड</strong><span>${deletedBy}</span></div>`
        : `
          <button class="action-btn" title="कार्ड देखें" aria-label="कार्ड देखें" onclick="window.regenerateCardModal(${c.id})">👁️ देखें</button>
          <button class="action-btn" title="कार्ड PNG डाउनलोड करें" aria-label="कार्ड डाउनलोड करें" onclick="window.downloadCardPng(${c.id})">⬇️ डाउनलोड</button>
          ${canDeleteCard ? `<button class="action-btn delete" title="कार्ड को Soft Delete करें" aria-label="कार्ड हटाएं (Soft Delete)" onclick="window.deleteCardRecord(${c.id})">🗑️ हटाएं</button>` : '<span class="text-muted" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:58px;min-width:58px;min-height:38px;padding:3px 4px;box-sizing:border-box;border:1px solid var(--border-color, #d1d5db);border-radius:8px;font-size:0.68rem;line-height:1.05;cursor:not-allowed;opacity:0.8;" title="दूसरे Admin का कार्ड — केवल Super Admin डिलीट कर सकता है" aria-label="डिलीट लॉक्ड — दूसरे Admin का कार्ड"><span style="font-size:0.95rem;line-height:1;">🗑️</span><span style="font-weight:700;letter-spacing:0.02em;">LOCKED</span></span>'}
        `;

      return `
        <tr class="${deleted ? 'record-deleted-row' : ''}" style="${deleted ? 'opacity:0.72;' : ''}">
          <td>
            <span class="card-code-badge ${deleted ? 'deleted' : 'active'}" title="पहले 4 अंक = कार्ड का स्थायी क्रमांक; डैश के बाद 4 अंक = unique random suffix">${c.card_code}</span>
          </td>
          <td>
            <div class="guest-cell-profile">
              <img src="${photoSrc}" alt="${c.guest_name}" class="guest-table-avatar" />
              <div class="guest-info-text">
                <div class="name"><span class="title">${c.title}</span>${c.guest_name}</div>
                <div style="font-size:0.75rem;color:var(--primary);font-weight:700;">[ ${badgeLabel} ]</div>
                <div class="about" title="${c.guest_about}">${c.guest_about}</div>
              </div>
            </div>
          </td>
          <td><span style="font-size:0.8rem;font-weight:700;text-transform:capitalize;">${c.theme}</span></td>
          <td><span title="${c.checksum}" style="font-family:monospace;font-size:0.75rem;color:var(--text-muted);">${shortHash}</span></td>
          <td>
            <div style="font-size:0.85rem;font-weight:600;">${c.created_by_name}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${createdDate}</div>
          </td>
          <td><div class="action-btn-group">${actionButtons}</div></td>
        </tr>
      `;
    }).join('');
  }

  // Download the saved card PNG directly from Saved Records without opening the modal.
  // Render in an off-screen (but layout-rendered) container so html2canvas can capture it.
  window.downloadCardPng = async function(cardId) {
    let tempContainer;
    try {
      const res = await API.getCardById(cardId);
      const card = res.card;
      if (!card) throw new Error('कार्ड रिकॉर्ड नहीं मिला');
      if (Number(card.is_deleted) === 1) {
        showToast('यह कार्ड डिलीटेड है; डाउनलोड लॉक है।', 'error');
        return;
      }

      const settings = res.masterSettings || state.masterSettings || {};
      tempContainer = document.createElement('div');
      tempContainer.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;z-index:-1;pointer-events:none;';
      document.body.appendChild(tempContainer);
      CardRenderer.renderInto(tempContainer, {
        title: card.title,
        guestName: card.guest_name,
        guestAbout: card.guest_about,
        guestBadge: card.guest_badge || 'विशिष्ट अतिथि',
        photoUrl: card.photo_url,
        theme: card.theme,
        cardCode: card.card_code,
        checksum: formatCardChecksum(card.created_by_username, card.checksum),
        programName: settings.program_name,
        programSubtitle: settings.program_subtitle,
        invocation: settings.invocation,
        invitationMessage: settings.invitation_message,
        eventDate: settings.event_date,
        eventTime: settings.event_time,
        eventVenue: settings.event_venue,
        organizer: settings.organizer_name
      });

      const cardNode = tempContainer.querySelector('.invitation-card');
      if (!cardNode) throw new Error('कार्ड का प्रीव्यू तैयार नहीं हो सका');
      const safeName = String(card.guest_name || 'Card').replace(/[^a-zA-Z0-9_\u0900-\u097F-]+/g, '_');
      await CardRenderer.exportPNG(cardNode, `Sadaneera_${card.card_code}_${safeName}.png`);
      showToast('कार्ड PNG डाउनलोड शुरू हो गया है', 'success');
    } catch (err) {
      showToast(err.message || 'PNG डाउनलोड नहीं हो सका', 'error');
    } finally {
      if (tempContainer) tempContainer.remove();
    }
  };

  window.regenerateCardModal = async function(cardId) {
    try {
      const res = await API.getCardById(cardId);
      const card = res.card;
      if (!card) return;
      if (Number(card.is_deleted) === 1) {
        showToast('यह कार्ड डिलीटेड है; देखना/डाउनलोड करना लॉक है।', 'error');
        return;
      }

      const s = res.masterSettings || state.masterSettings || {};
      const modalContainer = document.getElementById('regenerateCardContainer');
      const modalMeta = document.getElementById('regenerateCardMeta');

      // Re-render card purely on the fly in the DOM in portrait mode without saving images in DB!
      CardRenderer.renderInto(modalContainer, {
        title: card.title,
        guestName: card.guest_name,
        guestAbout: card.guest_about,
        guestBadge: card.guest_badge || 'विशिष्ट अतिथि',
        photoUrl: card.photo_url,
        theme: card.theme,
        cardCode: card.card_code,
        checksum: formatCardChecksum(card.created_by_username, card.checksum),
        programName: s.program_name,
        programSubtitle: s.program_subtitle,
        invocation: s.invocation,
        invitationMessage: s.invitation_message,
        eventDate: s.event_date,
        eventTime: s.event_time,
        eventVenue: s.event_venue,
        organizer: s.organizer_name
      });

      // Update meta info
      modalMeta.innerHTML = `
        <strong>कार्ड कोड:</strong> ${card.card_code} | 
        <strong>अतिथि:</strong> ${card.title} ${card.guest_name} [${card.guest_badge || 'विशिष्ट अतिथि'}] | 
        <strong>प्रशासक:</strong> ${card.created_by_name}
      `;

      // Setup Modal Download Buttons
      document.getElementById('btnModalDownloadPng').onclick = () => {
        const cardNode = modalContainer.querySelector('.invitation-card');
        CardRenderer.exportPNG(cardNode, `Sadaneera_${card.card_code}_${card.guest_name.replace(/\s+/g,'_')}.png`);
        showToast('पोर्ट्रेट कार्ड PNG डाउनलोड हो रहा है...', 'success');
      };

      document.getElementById('btnModalDownloadPdf').onclick = () => {
        const cardNode = modalContainer.querySelector('.invitation-card');
        CardRenderer.exportPDF(cardNode, `Sadaneera_${card.card_code}_${card.guest_name.replace(/\s+/g,'_')}.pdf`);
        showToast('पोर्ट्रेट कार्ड PDF डाउनलोड हो रहा है...', 'info');
      };


      regenerateModal.showModal();

      // Mobile responsive auto-scaling for modal preview card
      requestAnimationFrame(() => {
        const cardNode = modalContainer.querySelector('.invitation-card');
        const modalBody = modalContainer.closest('.dialog-body');
        if (cardNode && modalBody) {
          const availWidth = modalBody.clientWidth - 20;
          if (availWidth > 60 && availWidth < 720) {
            const scale = Math.min(0.85, Math.max(0.26, availWidth / 720));
            cardNode.style.transform = `scale(${scale})`;
            cardNode.style.transformOrigin = 'top center';
            const originH = 1040;
            const scaledH = originH * scale;
            cardNode.style.height = `${originH}px`;
            cardNode.style.marginBottom = `${-(originH - scaledH)}px`;
          } else if (cardNode) {
            cardNode.style.transform = 'none';
            cardNode.style.height = '';
            cardNode.style.marginBottom = '';
          }
        }
      });
    } catch (err) {
      showToast('रिकॉर्ड प्राप्त करने में विफल: ' + err.message, 'error');
    }
  };

  document.getElementById('btnCloseRegenerateModal')?.addEventListener('click', () => {
    regenerateModal.close();
  });

  // Edit/duplicate from Saved Records is intentionally disabled.
  // This prevents the misleading "Edit" flow from creating a new card
  // with a new serial number instead of updating the existing record.

  // Delete Card Record
  window.deleteCardRecord = async function(cardId) {
    if (!confirm('यह कार्ड डिलीटेड मार्क होगा। रिकॉर्ड और अतिथि फोटो सुरक्षित रहेंगे तथा पुनः उत्पन्न/एडिट/डिलीट क्रियाएं लॉक हो जाएंगी। आगे बढ़ें?')) return;

    try {
      const res = await API.deleteCard(cardId);
      showToast(res.message || 'रिकॉर्ड हटा दिया गया', 'success');
      await Promise.allSettled([loadRecords(), loadDashboard()]);
    } catch (err) {
      showToast(err.message || 'रिकॉर्ड हटाने में असमर्थ', 'error');
    }
  };

  // ==========================================================================
  // Module 2: Admin Management (Super Admin View)
  // ==========================================================================
  async function loadAdminsList() {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">लोड हो रहा है...</td></tr>`;

    try {
      const res = await API.getAdmins();
      renderAdminsTable(res.admins || res.users || []);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger); padding: 1.5rem;">त्रुटि: ${err.message}</td></tr>`;
    }
  }

  function renderAdminsTable(users) {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;

    tbody.innerHTML = users.map(u => {
      const isSuper = u.role === 'superadmin';
      const isCurrent = state.user?.id === u.id;
      const statusPill = u.is_active === 1 
        ? `<span class="table-status-pill active">सक्रिय (Active)</span>` 
        : `<span class="table-status-pill inactive">निष्क्रिय (Disabled)</span>`;

      const roleBadge = `<span class="role-tag ${u.role}">${u.role}</span>`;

      let actionButtons = '';
      if (!isCurrent) {
        const toggleButton = !isSuper
          ? `<button class="action-btn" onclick="window.toggleAdminState(${u.id})">${u.is_active === 1 ? 'रोकें (Deactivate)' : 'सक्रिय करें (Activate)'}</button>`
          : '';
        actionButtons = `${toggleButton}
          <button class="action-btn delete" onclick="window.deleteAdminUser(${u.id}, '${String(u.username).replace(/'/g, '&#39;')}')">🗑️ हटाएं</button>
        `;
      } else {
        actionButtons = `<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">वर्तमान लॉगिन खाता सुरक्षित</span>`;
      }

      return `
        <tr>
          <td>
            <div style="font-weight:700;">${u.full_name}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">${u.email || 'ईमेल नहीं'}</div>
          </td>
          <td><code>${u.username}</code></td>
          <td>${roleBadge}</td>
          <td><strong style="color:var(--primary); font-size:1.1rem;">${u.cards_generated || 0}</strong></td>
          <td>${statusPill}</td>
          <td><div class="action-btn-group">${actionButtons}</div></td>
        </tr>
      `;
    }).join('');
  }

  // Create New Admin Form Handler
  document.getElementById('createAdminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'बनाया जा रहा है...';

    const full_name = document.getElementById('newAdminFullName').value;
    const username = document.getElementById('newAdminUsername').value;
    const email = document.getElementById('newAdminEmail').value;
    const password = document.getElementById('newAdminPassword').value;
    const role = document.getElementById('newAdminRole').value;

    try {
      const res = await API.createAdmin({ full_name, username, email, password, role });
      showToast(res.message || 'नया प्रशासक खाता सफलतापूर्वक बनाया गया!', 'success');
      e.target.reset();
      loadAdminsList();
    } catch (err) {
      showToast(err.message || 'प्रशासक खाता बनाने में विफल', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '➕ प्रशासक बनाएं (Create Admin)';
    }
  });

  window.toggleAdminState = async function(userId) {
    try {
      const res = await API.toggleAdminStatus(userId);
      showToast(res.message, 'success');
      loadAdminsList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.deleteAdminUser = async function(userId, username) {
    if (!confirm(`क्या आप "${username}" का अकाउंट हटाना चाहते हैं? यदि यह duplicate Super Admin है, तो उसके सक्रिय कार्ड Soft Delete होंगे। कार्ड रिकॉर्ड और Google Drive फोटो स्थायी रूप से नहीं मिटेंगे।`)) return;
    try {
      const res = await API.deleteAdmin(userId);
      showToast(res.message, 'success');
      loadAdminsList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Super Admin: production reset of all invitation records + uploaded guest photos.
  document.getElementById('btnResetAllCards')?.addEventListener('click', async () => {
    const password = document.getElementById('resetAllCardsPassword')?.value || '';
    const phrase = document.getElementById('resetAllCardsPhrase')?.value.trim() || '';
    if (!password || !phrase) {
      showToast('Super Admin password और confirmation phrase दोनों आवश्यक हैं।', 'error');
      return;
    }
    if (phrase !== 'DELETE ALL CARDS') {
      showToast('Confirmation phrase सही नहीं है।', 'error');
      return;
    }
    if (!confirm('अंतिम चेतावनी: सभी invitation records और uploads की files स्थायी रूप से हट जाएंगी। Users और master settings सुरक्षित रहेंगे। क्या आप जारी रखना चाहते हैं?')) return;

    const btn = document.getElementById('btnResetAllCards');
    btn.disabled = true;
    btn.textContent = 'डेटा साफ किया जा रहा है...';
    try {
      const res = await API.resetAllCards(password, phrase);
      showToast(res.message || 'सभी कार्ड डेटा साफ कर दिया गया।', 'success');
      document.getElementById('resetAllCardsPassword').value = '';
      document.getElementById('resetAllCardsPhrase').value = '';
      await loadRecords();
      await loadDashboard();
    } catch (err) {
      showToast(err.message || 'Reset असफल रहा।', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🗑️ सभी कार्ड डेटा साफ करें';
    }
  });

  // ==========================================================================
  // Dashboard Overview Metrics
  // ==========================================================================
  function formatDashboardDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderShareChart(containerId, admins, percentageKey, countKey, emptyText) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const rows = (admins || []).filter(a => Number(a[countKey] || 0) > 0);
    if (!rows.length) {
      el.innerHTML = `<div class="share-chart-empty">${emptyText}</div>`;
      return;
    }
    el.innerHTML = rows.map(a => {
      const pct = Number(a[percentageKey] || 0);
      const count = Number(a[countKey] || 0);
      return `
        <div class="share-row">
          <div class="share-row-head">
            <strong>${a.full_name}</strong>
            <span>${count} कार्ड · ${pct.toFixed(1)}%</span>
          </div>
          <div class="share-track" aria-label="${a.full_name}: ${pct.toFixed(1)} प्रतिशत">
            <div class="share-fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div>
          </div>
        </div>`;
    }).join('');
  }

  async function loadDashboard() {
    try {
      const res = await API.getDashboardStats();
      // The Worker returns snake_case fields at the response root (not res.stats).
      // Normalize here so the dashboard and its charts use the live API contract.
      const rawAdmins = res.admin_performance || [];
      const totalCards = Number(res.total_cards || 0);
      const activeCards = Number(res.active_cards || 0);
      const deletedCards = Number(res.deleted_cards || 0);
      const todayCards = Number(res.today_cards || 0);
      const admins = rawAdmins.map((a) => ({
        ...a,
        full_name: a.full_name || 'Admin',
        username: a.username || '',
        admin_created_at: a.created_at || null,
        total_cards: Number(a.total_cards || 0),
        active_cards: Number(a.active_cards || 0),
        deleted_actions: Number(a.deleted_cards || 0),
        today_cards: Number(a.today_cards || 0),
        lifetime_percentage: totalCards ? (Number(a.total_cards || 0) / totalCards) * 100 : 0,
        today_percentage: todayCards ? (Number(a.today_cards || 0) / todayCards) * 100 : 0
      }));
      const stats = {
        totalCards,
        activeCards,
        deletedCards,
        todayCards,
        totalAdmins: Number(res.total_admins || 0),
        myCards: Number(rawAdmins.find((a) => a.username === state.user?.username)?.total_cards || 0),
        lifetimeTotal: totalCards,
        todayTotal: todayCards,
        adminActivity: admins,
        recentCards: res.recent_cards || []
      };

      document.getElementById('statTotalCards').textContent = stats.totalCards || 0;
      document.getElementById('statTodayCards').textContent = stats.todayCards || 0;
      document.getElementById('statTotalAdmins').textContent = stats.totalAdmins || 0;
      document.getElementById('statMyCards').textContent = stats.myCards || 0;

      const activityBody = document.getElementById('adminActivityTableBody');
      if (activityBody) {
        if (!admins.length) {
          activityBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted);">अभी कोई एडमिन रिकॉर्ड उपलब्ध नहीं है।</td></tr>`;
        } else {
          activityBody.innerHTML = admins.map(a => `
            <tr>
              <td>
                <div style="font-weight:800;">${a.full_name}</div>
                <div style="font-size:.72rem;color:var(--text-muted);">@${a.username}</div>
              </td>
              <td>${formatDashboardDate(a.admin_created_at)}</td>
              <td><strong class="dashboard-number">${a.total_cards}</strong></td>
              <td>${a.active_cards}</td>
              <td>${a.deleted_actions}</td>
              <td><strong>${a.today_cards}</strong></td>
            </tr>
          `).join('');
        }
      }

      const lifetimeTotal = Number(stats.lifetimeTotal || 0);
      const todayTotal = Number(stats.todayTotal || 0);
      const lifetimeBadge = document.getElementById('dashboardLifetimeTotal');
      const lifetimeChartTotal = document.getElementById('dashboardLifetimeChartTotal');
      const todayChartTotal = document.getElementById('dashboardTodayChartTotal');
      if (lifetimeBadge) lifetimeBadge.textContent = `${lifetimeTotal} कुल कार्ड`;
      if (lifetimeChartTotal) lifetimeChartTotal.textContent = `${lifetimeTotal} कार्ड`;
      if (todayChartTotal) todayChartTotal.textContent = `${todayTotal} कार्ड`;

      renderShareChart('lifetimeShareChart', admins, 'lifetime_percentage', 'total_cards', 'अभी कोई lifetime card नहीं बना है।');
      renderShareChart('todayShareChart', admins, 'today_percentage', 'today_cards', 'आज अभी कोई card नहीं बना है।');

      // Recent activity is intentionally capped at 10.
      const recentList = document.getElementById('dashboardRecentCards');
      if (recentList) {
        const recent = (stats.recentCards || []).slice(0, 10);
        if (!recent.length) {
          recentList.innerHTML = `<p style="padding:1.5rem;text-align:center;color:var(--text-muted);">कोई हालिया निमंत्रण नहीं मिला।</p>`;
        } else {
          recentList.innerHTML = recent.map(c => {
            const deleted = Number(c.is_deleted) === 1;
            const action = deleted
              ? `<span class="table-status-pill inactive">🗑️ डिलीटेड — क्रियाएं लॉक</span>`
              : `<button class="action-btn" onclick="window.regenerateCardModal(${c.id})">पुनः देखें</button>`;
            return `
              <div class="dashboard-recent-item ${deleted ? 'record-deleted-row' : ''}">
                <div class="dashboard-recent-main">
                  <img src="${c.photo_url || DEFAULT_AVATAR}" alt="${c.guest_name}" />
                  <div>
                    <div style="font-weight:800;font-size:.9rem;">${c.title} ${c.guest_name}</div>
                    <div style="font-size:.74rem;color:var(--text-muted);">${c.card_code} · ${c.created_by_name} · ${formatDashboardDate(c.created_at)}</div>
                  </div>
                </div>
                ${action}
              </div>`;
          }).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }

  // Cross-browser admin sync: poll the authenticated dashboard summary for
  // card changes. Refresh only dashboard/records data, never the whole page,
  // so another admin's action cannot interrupt an unsaved generator form.
  let lastCardChangeSignature = null;
  let cardSyncInFlight = false;
  let cardSyncTimer = null;

  function getCardChangeSignature(res) {
    const recent = (res?.recent_cards || []).map(card =>
      `${card.id}:${Number(card.is_deleted) === 1 ? 1 : 0}:${card.created_at || ''}:${card.deleted_at || ''}`
    ).join(',');
    return [
      Number(res?.total_cards || 0),
      Number(res?.active_cards || 0),
      Number(res?.deleted_cards || 0),
      Number(res?.today_cards || 0),
      recent
    ].join('|');
  }

  async function syncCardChangesAcrossAdmins() {
    if (!state.user || document.hidden || cardSyncInFlight) return;
    cardSyncInFlight = true;
    try {
      const res = await API.getDashboardStats();
      if (!res?.success) return;

      const signature = getCardChangeSignature(res);
      if (lastCardChangeSignature === null) {
        lastCardChangeSignature = signature;
        return;
      }

      if (signature !== lastCardChangeSignature) {
        lastCardChangeSignature = signature;
        // These functions update hidden tabs safely; they do not navigate or
        // reload the page, preserving any in-progress card form.
        await Promise.allSettled([loadDashboard(), loadRecords()]);
      }
    } catch (err) {
      // A temporary network failure should not disrupt the active workflow.
      console.debug('Cross-admin card sync deferred:', err?.message || err);
    } finally {
      cardSyncInFlight = false;
    }
  }

  function startCardChangeSync() {
    if (cardSyncTimer) clearInterval(cardSyncTimer);
    lastCardChangeSignature = null;
    // Establish a baseline immediately, then check every 10 seconds. API reads
    // use cache: 'no-store', so each check reflects the latest Worker/D1 state.
    syncCardChangesAcrossAdmins();
    cardSyncTimer = setInterval(syncCardChangesAcrossAdmins, 10000);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncCardChangesAcrossAdmins();
  });

  // Application Startup & Auth State Resolution
  async function initApp() {
    try {
      await loadMasterSettings();
    } catch (e) {
      console.warn('Startup settings load warning:', e);
    }

    try {
      await checkAuth();
    } catch (e) {
      console.error('Startup auth check error:', e);
      document.body.classList.add('is-unauthenticated');
      openLoginModal(false);
    } finally {
      // Guaranteed clean exit from initial startup splash
      hideSplash();
    }

    setGenderAndTitle('male');
    fitPreviewToContainer();
    setTimeout(fitPreviewToContainer, 100);
  }

  initApp();

  // Progressive Web App (PWA) Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('PWA service worker registration notice:', err);
      });
    });
  }

  // Floating In-App Install Prompt (Bottom-Right, Minimal, Auto-hiding)
  let deferredInstallPrompt = null;
  let installPromptTimer = null;
  const floatingPrompt = document.getElementById('floatingInstallPrompt');
  const btnFloatingInstall = document.getElementById('btnFloatingInstall');
  const btnDismissInstall = document.getElementById('btnDismissInstall');

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  function showInstallPromptOnce() {
    if (isStandalone) return;
    if (sessionStorage.getItem('sadanira_install_dismissed') === '1') return;
    if (!floatingPrompt) return;

    // Show unobtrusively after user opens/logs into the main page
    setTimeout(() => {
      if (sessionStorage.getItem('sadanira_install_dismissed') === '1') return;
      floatingPrompt.style.display = 'inline-flex';
      requestAnimationFrame(() => {
        floatingPrompt.classList.add('prompt-visible');
      });

      // Auto-hide after 8 seconds of clean visibility
      if (installPromptTimer) clearTimeout(installPromptTimer);
      installPromptTimer = setTimeout(() => {
        hideInstallPrompt(false);
      }, 8000);
    }, 1500);
  }

  function hideInstallPrompt(permanent = true) {
    if (!floatingPrompt) return;
    floatingPrompt.classList.remove('prompt-visible');
    setTimeout(() => {
      floatingPrompt.style.display = 'none';
    }, 380);
    if (permanent) {
      sessionStorage.setItem('sadanira_install_dismissed', '1');
    }
    if (installPromptTimer) clearTimeout(installPromptTimer);
  }

  if (floatingPrompt && btnFloatingInstall && !isStandalone) {
    // Dismiss button click
    btnDismissInstall?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideInstallPrompt(true);
    });

    // Install trigger
    btnFloatingInstall.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          hideInstallPrompt(true);
          showToast('सदानीरा ऐप इंस्टॉल हो रहा है!', 'success');
        }
        deferredInstallPrompt = null;
      } else if (isIOS) {
        showToast('iPhone/iPad पर इंस्टॉल करने के लिए Safari में Share बटन (⬆️) दबाकर "Add to Home Screen" चुनें।', 'info');
        hideInstallPrompt(true);
      } else {
        showToast('ब्राउज़र मेनू से "Install App" या "Add to Home Screen" चुनें।', 'info');
        hideInstallPrompt(true);
      }
    });

    // Pause timer on hover, resume on mouse leave
    floatingPrompt.addEventListener('mouseenter', () => {
      if (installPromptTimer) clearTimeout(installPromptTimer);
    });
    floatingPrompt.addEventListener('mouseleave', () => {
      if (installPromptTimer) clearTimeout(installPromptTimer);
      installPromptTimer = setTimeout(() => {
        hideInstallPrompt(false);
      }, 3500);
    });

    // Listen for Chromium beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (state.user) {
        showInstallPromptOnce();
      }
    });

    window.addEventListener('appinstalled', () => {
      hideInstallPrompt(true);
      showToast('सदानीरा ऐप सफलतापूर्वक इंस्टॉल हो गया!', 'success');
    });

    // If user already logged in
    if (state.user) {
      showInstallPromptOnce();
    }
  }

  // Offline / Online Connectivity Alerts
  window.addEventListener('offline', () => {
    showToast('⚠️ आप ऑफ़लाइन हैं। सहेजा गया डेटा इस्तेमाल किया जा रहा है।', 'info');
  });
  window.addEventListener('online', () => {
    showToast('✅ इंटरनेट पुनः कनेक्ट हो गया है।', 'success');
  });
});
