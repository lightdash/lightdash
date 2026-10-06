import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGuideSql } from './useGuideSql';

const input = {
    aiQueryProcedureEnabled: false,
    procedureDatabase: 'ANALYTICS',
    procedureSchema: 'AI_GOVERNANCE',
    procedureName: 'LIGHTDASH_AI_RUN_SQL',
    procedureOwnerRole: 'OWNER',
    allowedSchemas: [{ database: 'DATA', schema: 'PUBLIC' }],
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

describe('procedure session ceiling', () => {
    it('adds program usage only when enabled and all procedure inputs are valid', () => {
        const { result, rerender } = renderHook((props) => useGuideSql(props), {
            initialProps: {
                ...input,
                roles: 'ANALYST',
                aiQueryProcedureEnabled: true,
            },
        });
        expect(result.current.procedure?.settingValue).toBe(
            '"ANALYTICS"."AI_GOVERNANCE"."LIGHTDASH_AI_RUN_SQL"',
        );
        expect(result.current.ceilingSql).toContain(
            'schemas: [ANALYTICS.AI_GOVERNANCE]',
        );
        rerender({
            ...input,
            roles: 'ANALYST',
            aiQueryProcedureEnabled: false,
        });
        expect(result.current.procedure).toBeNull();
        expect(result.current.ceilingSql).not.toContain('program usage');
        rerender({ ...input, roles: '', aiQueryProcedureEnabled: true });
        expect(result.current.procedure).toBeNull();
        expect(result.current.ceilingSql).not.toContain('program usage');
    });

    it('does not emit an unsafe session scope for quoted procedure schema names', () => {
        const { result } = renderHook(() =>
            useGuideSql({
                ...input,
                roles: 'ANALYST',
                aiQueryProcedureEnabled: true,
                procedureSchema: 'A.B',
            }),
        );
        expect(result.current.procedure).not.toBeNull();
        expect(result.current.ceilingSql).toBe('');
    });
});
