export class AuthManager {
  constructor({ apiClient, documentRef = document } = {}) {
    this.apiClient = apiClient;
    this.document = documentRef;
    this.gate = this.document.querySelector('#auth-gate');
    this.appShell = this.document.querySelector('.app-shell');
    this.form = this.document.querySelector('#login-form');
    this.email = this.document.querySelector('#login-email');
    this.password = this.document.querySelector('#login-password');
    this.submit = this.document.querySelector('#login-submit');
    this.error = this.document.querySelector('#login-error');
    this.loading = this.document.querySelector('#auth-loading');
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

  showLogin(message = '') {
    this.user = null;
    this.setLoading(false);
    this.setError(message);
    if (this.gate) this.gate.hidden = false;
    if (this.appShell) this.appShell.hidden = true;
    if (this.logout) this.logout.hidden = true;
    this.email?.focus();
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
