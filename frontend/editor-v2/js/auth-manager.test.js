import { describe, expect, it, vi } from 'vitest';
import { AuthManager } from './auth-manager.js';

function fixture() {
  document.body.innerHTML = `
    <section id="auth-gate"><form id="login-form"><input id="login-email"><input id="login-password"><button id="login-submit"></button><span id="auth-loading"></span><p id="login-error"></p></form></section>
    <div class="app-shell"><span id="account-label"></span><span id="account-avatar"></span><button id="logout-button"></button></div>
  `;
  const apiClient = {
    me: vi.fn(),
    login: vi.fn(),
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
});
