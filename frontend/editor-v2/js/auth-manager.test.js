import { describe, expect, it, vi } from 'vitest';
import { AuthManager } from './auth-manager.js';

function fixture() {
  document.body.innerHTML = `
    <section id="auth-gate"><div id="login-view"></div><div id="register-view" hidden></div><form id="login-form"><input id="login-email"><input id="login-password"><button id="login-submit"></button><span id="auth-loading"></span><p id="login-error"></p></form><form id="register-form" hidden><input id="register-name"><input id="register-email"><input id="register-password"><input id="register-confirm-password"><button id="register-submit"></button><span id="register-loading"></span><p id="register-error"></p></form><button id="show-register"></button><button id="show-login" hidden></button></section>
    <div class="app-shell"><span id="account-label"></span><span id="account-avatar"></span><button id="logout-button"></button></div>
  `;
  const apiClient = {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    resetSession: vi.fn(),
  };
  return { apiClient, manager: new AuthManager({ apiClient }) };
}

describe('AuthManager', () => {
  it('keeps the editor hidden when there is no authenticated session', async () => {
    const { apiClient, manager } = fixture();
    apiClient.me.mockResolvedValue({ authenticated: false, user: null });
    await manager.start();
    expect(document.querySelector('.app-shell').hidden).toBe(true);
    expect(document.querySelector('#auth-gate').hidden).toBe(false);
  });

  it('shows the editor after a successful login', async () => {
    const { apiClient, manager } = fixture();
    apiClient.me.mockResolvedValue({ authenticated: false, user: null });
    apiClient.login.mockResolvedValue({ user: { email: 'user@example.com', display_name: 'Test User' } });
    await manager.start();
    document.querySelector('#login-email').value = 'user@example.com';
    document.querySelector('#login-password').value = 'correct horse battery staple';
    await manager.login();
    expect(document.querySelector('.app-shell').hidden).toBe(false);
    expect(document.querySelector('#account-label').textContent).toBe('Test User');
    expect(document.querySelector('#logout-button').hidden).toBe(false);
  });

  it('returns to login and clears local session state on logout', async () => {
    const { apiClient, manager } = fixture();
    apiClient.me.mockResolvedValue({ authenticated: true, user: { email: 'user@example.com' } });
    await manager.start();
    apiClient.logout.mockResolvedValue({ success: true });
    await manager.signOut();
    expect(apiClient.resetSession).toHaveBeenCalledOnce();
    expect(document.querySelector('.app-shell').hidden).toBe(true);
    expect(document.querySelector('#auth-gate').hidden).toBe(false);
  });

  it('displays login errors without storing a session token', async () => {
    const { apiClient, manager } = fixture();
    apiClient.me.mockResolvedValue({ authenticated: false, user: null });
    apiClient.login.mockRejectedValue(new Error('Invalid email or password.'));
    await manager.start();
    document.querySelector('#login-email').value = 'user@example.com';
    document.querySelector('#login-password').value = 'wrong';
    await manager.login();
    expect(document.querySelector('#login-error').textContent).toContain('Invalid email');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('switches between sign in and create account views', () => {
    const { manager } = fixture();
    manager.showRegister();
    expect(document.querySelector('#login-form').hidden).toBe(true);
    expect(document.querySelector('#register-form').hidden).toBe(false);
    document.querySelector('#show-login').click();
    expect(document.querySelector('#login-form').hidden).toBe(false);
    expect(document.querySelector('#register-form').hidden).toBe(true);
  });

  it('validates password confirmation before calling the API', async () => {
    const { apiClient, manager } = fixture();
    manager.showRegister();
    document.querySelector('#register-email').value = 'new@example.com';
    document.querySelector('#register-password').value = 'password123';
    document.querySelector('#register-confirm-password').value = 'different123';
    await manager.register();
    expect(apiClient.register).not.toHaveBeenCalled();
    expect(document.querySelector('#register-error').textContent).toContain('do not match');
  });

  it('registers the user and signs them in automatically', async () => {
    const { apiClient, manager } = fixture();
    apiClient.register.mockResolvedValue({ success: true, user: { email: 'new@example.com' } });
    apiClient.login.mockResolvedValue({ user: { email: 'new@example.com', display_name: 'New User' } });
    manager.showRegister();
    document.querySelector('#register-name').value = 'New User';
    document.querySelector('#register-email').value = 'new@example.com';
    document.querySelector('#register-password').value = 'password123';
    document.querySelector('#register-confirm-password').value = 'password123';
    await manager.register();
    expect(apiClient.register).toHaveBeenCalledWith('new@example.com', 'password123', 'New User');
    expect(apiClient.login).toHaveBeenCalledWith('new@example.com', 'password123');
    expect(document.querySelector('.app-shell').hidden).toBe(false);
  });
});
