export class AuthManager {
  constructor({ apiClient, documentRef = document } = {}) {
    this.apiClient = apiClient;
    this.document = documentRef;
    this.gate = this.document.querySelector('#auth-gate');
    this.appShell = this.document.querySelector('.app-shell');
    this.form = this.document.querySelector('#login-form');
    this.registerForm = this.document.querySelector('#register-form');
    this.loginView = this.document.querySelector('#login-view');
    this.registerView = this.document.querySelector('#register-view');
    this.email = this.document.querySelector('#login-email');
    this.password = this.document.querySelector('#login-password');
    this.submit = this.document.querySelector('#login-submit');
    this.error = this.document.querySelector('#login-error');
    this.registerName = this.document.querySelector('#register-name');
    this.registerEmail = this.document.querySelector('#register-email');
    this.registerPassword = this.document.querySelector('#register-password');
    this.registerConfirmPassword = this.document.querySelector('#register-confirm-password');
    this.registerSubmit = this.document.querySelector('#register-submit');
    this.registerError = this.document.querySelector('#register-error');
    this.loading = this.document.querySelector('#auth-loading');
    this.registerLoading = this.document.querySelector('#register-loading');
    this.showRegisterButton = this.document.querySelector('#show-register');
    this.showLoginButton = this.document.querySelector('#show-login');
    this.userLabel = this.document.querySelector('#account-label');
    this.avatar = this.document.querySelector('#account-avatar');
    this.logout = this.document.querySelector('#logout-button');
    this.user = null;
    this.bind();
    window.addEventListener('ic-auth-required', () => {
      this.apiClient.resetSession();
      this.showLogin('Your session expired. Sign in again to continue.');
    });
  }

  bind() {
    this.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.login();
    });
    this.registerForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.register();
    });
    this.showRegisterButton?.addEventListener('click', () => this.showRegister());
    this.showLoginButton?.addEventListener('click', () => this.showLogin());
    this.logout?.addEventListener('click', () => this.signOut());
  }

  setLoading(isLoading) {
    if (this.loading) this.loading.hidden = !isLoading;
    if (this.submit) this.submit.disabled = isLoading;
    if (this.form) this.form.setAttribute('aria-busy', String(isLoading));
  }

  setError(message = '') {
    if (!this.error) return;
    this.error.textContent = message;
    this.error.hidden = !message;
  }

  setRegisterError(message = '') {
    if (!this.registerError) return;
    this.registerError.textContent = message;
    this.registerError.hidden = !message;
  }

  setRegisterLoading(isLoading) {
    if (this.registerLoading) this.registerLoading.hidden = !isLoading;
    if (this.registerSubmit) this.registerSubmit.disabled = isLoading;
    if (this.registerForm) this.registerForm.setAttribute('aria-busy', String(isLoading));
  }

  showLogin(message = '') {
    this.user = null;
    this.setLoading(false);
    this.setRegisterLoading(false);
    this.setError(message);
    this.setRegisterError('');
    if (this.gate) this.gate.hidden = false;
    if (this.appShell) this.appShell.hidden = true;
    if (this.logout) this.logout.hidden = true;
    if (this.loginView) this.loginView.hidden = false;
    if (this.registerView) this.registerView.hidden = true;
    if (this.form) this.form.hidden = false;
    if (this.registerForm) this.registerForm.hidden = true;
    if (this.showRegisterButton) this.showRegisterButton.hidden = false;
    if (this.showLoginButton) this.showLoginButton.hidden = true;
    this.email?.focus();
  }

  showRegister(message = '') {
    this.user = null;
    this.setLoading(false);
    this.setRegisterLoading(false);
    this.setError('');
    this.setRegisterError(message);
    if (this.gate) this.gate.hidden = false;
    if (this.appShell) this.appShell.hidden = true;
    if (this.logout) this.logout.hidden = true;
    if (this.loginView) this.loginView.hidden = true;
    if (this.registerView) this.registerView.hidden = false;
    if (this.form) this.form.hidden = true;
    if (this.registerForm) this.registerForm.hidden = false;
    if (this.showRegisterButton) this.showRegisterButton.hidden = true;
    if (this.showLoginButton) this.showLoginButton.hidden = false;
    this.registerName?.focus();
  }

  showEditor(user) {
    this.user = user;
    const label = user?.display_name || user?.email || 'Account';
    if (this.userLabel) this.userLabel.textContent = label;
    if (this.avatar) this.avatar.textContent = label.slice(0, 2).toUpperCase();
    if (this.gate) this.gate.hidden = true;
    if (this.appShell) this.appShell.hidden = false;
    if (this.logout) this.logout.hidden = false;
    this.setError('');
  }

  async start() {
    this.setLoading(true);
    try {
      const result = await this.apiClient.me();
      if (result.authenticated && result.user) {
        this.showEditor(result.user);
        return result.user;
      }
      this.showLogin();
    } catch (error) {
      this.showLogin(error.message);
    }
    return null;
  }

  async login() {
    const email = this.email?.value.trim() || '';
    const password = this.password?.value || '';
    if (!email || !password) {
      this.setError('Enter your email and password.');
      return null;
    }
    this.setLoading(true);
    this.setError('');
    try {
      const result = await this.apiClient.login(email, password);
      this.showEditor(result.user);
      return result.user;
    } catch (error) {
      this.setLoading(false);
      this.setError(error.message);
      return null;
    }
  }

  async register() {
    const displayName = this.registerName?.value.trim() || '';
    const email = this.registerEmail?.value.trim() || '';
    const password = this.registerPassword?.value || '';
    const confirmation = this.registerConfirmPassword?.value || '';
    if (!email || !password || !confirmation) {
      this.setRegisterError('Enter your email, password, and password confirmation.');
      return null;
    }
    if (password.length < 8) {
      this.setRegisterError('Password must be at least 8 characters long.');
      return null;
    }
    if (password !== confirmation) {
      this.setRegisterError('Passwords do not match.');
      return null;
    }
    this.setRegisterLoading(true);
    this.setRegisterError('');
    try {
      await this.apiClient.register(email, password, displayName);
      const result = await this.apiClient.login(email, password);
      this.showEditor(result.user);
      return result.user;
    } catch (error) {
      this.setRegisterLoading(false);
      this.setRegisterError(error.message);
      return null;
    }
  }

  async signOut() {
    this.setLoading(true);
    try {
      await this.apiClient.logout();
    } catch (error) {
      // The local session is still cleared even if the server is unreachable.
      this.setError(error.message);
    } finally {
      this.apiClient.resetSession();
      this.showLogin();
    }
  }
}
