import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const authFile = 'test-results/browser/.auth/user.json';
const email = 'browser-owner@example.com';
const password = 'correct horse battery staple';

setup('authenticate browser context', async ({ request }) => {
  const registration = await request.post('/api/auth/register', {
    data: { email, password, display_name: 'Browser Owner' },
  });
  expect([201, 409]).toContain(registration.status());

  const login = await request.post('/api/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();

  mkdirSync(dirname(authFile), { recursive: true });
  await request.storageState({ path: authFile });
});
