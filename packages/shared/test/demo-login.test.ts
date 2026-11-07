import { describe, expect, it } from 'vitest';
import {
  checkDemoCredentials,
  DEMO_CREDENTIALS,
  DEMO_PASSWORD,
  isDemoUsername,
} from '../src/index.js';

describe('public demo login', () => {
  it('demo-publisher / 1234 signs into the affiliate demo profile', () => {
    expect(checkDemoCredentials('demo-publisher', '1234')).toEqual({
      profileId: 'demo-aff-1',
      role: 'affiliate',
    });
  });

  it('demo-advertiser / 1234 signs into the advertiser demo profile', () => {
    expect(checkDemoCredentials('demo-advertiser', '1234')).toEqual({
      profileId: 'demo-adv-1',
      role: 'advertiser',
    });
  });

  it('rejects a wrong password with a plain error', () => {
    expect(checkDemoCredentials('demo-publisher', 'wrong')).toEqual({
      error: 'Incorrect demo password.',
    });
    expect(checkDemoCredentials('demo-advertiser', '')).toEqual({
      error: 'Incorrect demo password.',
    });
  });

  it('rejects an unknown demo username', () => {
    expect(checkDemoCredentials('demo-admin', '1234')).toEqual({
      error: 'Unknown demo username.',
    });
  });

  it('matches usernames case-insensitively and ignores surrounding spaces', () => {
    expect(checkDemoCredentials(' Demo-Publisher ', '1234')).toEqual({
      profileId: 'demo-aff-1',
      role: 'affiliate',
    });
    expect(checkDemoCredentials('DEMO-ADVERTISER', '1234')).toEqual({
      profileId: 'demo-adv-1',
      role: 'advertiser',
    });
  });

  it('isDemoUsername only matches the two public demo usernames', () => {
    expect(isDemoUsername('demo-publisher')).toBe(true);
    expect(isDemoUsername('demo-advertiser')).toBe(true);
    expect(isDemoUsername('someone@example.com')).toBe(false);
    expect(isDemoUsername('demo-admin')).toBe(false);
  });

  it('publishes exactly two demo credentials sharing one public password', () => {
    expect(DEMO_CREDENTIALS).toHaveLength(2);
    expect(DEMO_PASSWORD).toBe('1234');
    for (const c of DEMO_CREDENTIALS) expect(c.password).toBe(DEMO_PASSWORD);
  });
});
