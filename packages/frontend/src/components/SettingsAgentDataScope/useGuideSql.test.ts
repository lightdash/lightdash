import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGuideSql } from './useGuideSql';

const input = {
    integrationName: '',
    redirectUri: 'https://example.com/callback',
    roles: '',
    account: 'account',
    tagDatabase: 'DATA',
    tagSchema: 'SECURITY',
    protectedSchemas: [],
    aiIdentitiesEnabled: true,
    identityNames: ['PERSON_AI'],
};

describe('guide SQL identity mode', () => {
    it('attaches session policies to identities instead of the account', () => {
        const { result } = renderHook(() => useGuideSql(input));
        expect(result.current.ceilingSql).toContain(
            'ALTER USER "PERSON_AI" SET SESSION POLICY',
        );
        expect(result.current.ceilingSql).not.toContain('ALTER ACCOUNT');
        expect(result.current.integrationSql).toBe('');
    });
    it('does not offer incomplete session SQL before AI identities are named', () => {
        const { result } = renderHook(() =>
            useGuideSql({ ...input, identityNames: [] }),
        );
        expect(result.current.ceilingSql).toBe('');
    });
    it('uses the account policy only on the legacy path', () => {
        const { result } = renderHook(() =>
            useGuideSql({ ...input, aiIdentitiesEnabled: false }),
        );
        expect(result.current.ceilingSql).toContain(
            'ALTER ACCOUNT SET SESSION POLICY',
        );
        expect(result.current.ceilingSql).not.toContain('ALTER USER');
    });
});
