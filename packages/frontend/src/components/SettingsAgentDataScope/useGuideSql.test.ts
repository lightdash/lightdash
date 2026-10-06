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
};

describe('guide SQL', () => {
    it('generates the account Restricted Session Scope and no per-person policy', () => {
        const { result } = renderHook(() => useGuideSql(input));
        expect(result.current.ceilingSql).toContain(
            'CREATE RESTRICTED SESSION SCOPE',
        );
        expect(result.current.ceilingSql).toContain(
            'ALTER ACCOUNT SET SESSION POLICY',
        );
        expect(result.current.ceilingSql).not.toContain('ALTER USER');
        expect(result.current.integrationSql).toBe('');
    });
});
