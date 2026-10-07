import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    hasAgentIdentityHint,
    updateAgentIdentityHint,
} from './agentIdentityHint';

describe('agent identity hint', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('writes only an enabled flag and clears a disabled flag', () => {
        updateAgentIdentityHint('org-1', undefined);
        expect(localStorage.length).toBe(0);
        updateAgentIdentityHint('org-1', false);
        expect(localStorage.length).toBe(0);
        updateAgentIdentityHint('org-1', true);
        expect(hasAgentIdentityHint('org-1')).toBe(true);
        updateAgentIdentityHint('org-1', undefined);
        expect(hasAgentIdentityHint('org-1')).toBe(true);
        updateAgentIdentityHint('org-1', false);
        expect(hasAgentIdentityHint('org-1')).toBe(false);
        expect(localStorage.length).toBe(0);
    });

    it('scopes the hint to its organisation', () => {
        updateAgentIdentityHint('org-1', true);
        expect(hasAgentIdentityHint('org-2')).toBe(false);
        updateAgentIdentityHint('org-2', true);
        updateAgentIdentityHint('org-1', false);
        expect(hasAgentIdentityHint('org-2')).toBe(true);
        expect(hasAgentIdentityHint('org-1')).toBe(false);
    });

    it('ignores an unresolved organisation', () => {
        updateAgentIdentityHint(undefined, true);
        expect(hasAgentIdentityHint(undefined)).toBe(false);
        expect(localStorage.length).toBe(0);
    });

    it('tolerates unavailable storage', () => {
        for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
            vi.spyOn(Storage.prototype, method).mockImplementation(() => {
                throw new Error('Storage unavailable');
            });
        }
        expect(hasAgentIdentityHint('org-1')).toBe(false);
        expect(() => updateAgentIdentityHint('org-1', true)).not.toThrow();
        expect(() => updateAgentIdentityHint('org-1', false)).not.toThrow();
    });
});
