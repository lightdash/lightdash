import { parseScopes } from './parseScopes';

describe('parseScopes', () => {
    describe('with valid scopes', () => {
        it('should return valid scope names for non-enterprise', () => {
            const result = parseScopes({
                scopes: ['view:dashboard', 'manage:dashboard'],
                isEnterprise: false,
            });

            expect(result.valid).toBeInstanceOf(Set);
            expect(result.valid.size).toBe(2);
            expect(result.valid.has('view:Dashboard')).toBe(true);
            expect(result.valid.has('manage:Dashboard')).toBe(true);
            expect(result.invalid).toEqual([]);
        });

        it('should return valid scope names for enterprise', () => {
            const result = parseScopes({
                scopes: ['view:ai_agent', 'manage:ai_agent'],
                isEnterprise: true,
            });

            expect(result.valid.size).toBe(2);
            expect(result.valid.has('view:AiAgent')).toBe(true);
            expect(result.valid.has('manage:AiAgent')).toBe(true);
            expect(result.invalid).toEqual([]);
        });

        it('should handle mixed case scope names correctly', () => {
            const result = parseScopes({
                scopes: ['manage:custom_sql', 'manage:personal_access_token'],
                isEnterprise: true,
            });

            expect(result.valid.size).toBe(2);
            expect(result.valid.has('manage:CustomSql')).toBe(true);
            expect(result.valid.has('manage:PersonalAccessToken')).toBe(true);
            expect(result.invalid).toEqual([]);
        });

        it('should handle single scope correctly', () => {
            const result = parseScopes({
                scopes: ['view:project'],
                isEnterprise: false,
            });

            expect(result.valid.size).toBe(1);
            expect(result.valid.has('view:Project')).toBe(true);
            expect(result.invalid).toEqual([]);
        });

        it('should handle empty scopes array', () => {
            const result = parseScopes({
                scopes: [],
                isEnterprise: false,
            });

            expect(result.valid.size).toBe(0);
            expect(result.invalid).toEqual([]);
        });
    });

    describe('with invalid scopes', () => {
        it('should separate invalid scope names from valid ones', () => {
            const result = parseScopes({
                scopes: ['view:dashboard', 'invalid:scope'],
                isEnterprise: false,
            });

            expect(result.valid).toEqual(new Set(['view:Dashboard']));
            expect(result.invalid).toEqual(['invalid:Scope']);
        });

        it('should treat enterprise-only scopes as invalid when not enterprise', () => {
            const nonEnterprise = parseScopes({
                scopes: ['view:dashboard', 'view:ai_agent'],
                isEnterprise: false,
            });
            expect(nonEnterprise.valid).toEqual(new Set(['view:Dashboard']));
            expect(nonEnterprise.invalid).toEqual(['view:AiAgent']);

            const enterprise = parseScopes({
                scopes: ['view:dashboard', 'view:ai_agent'],
                isEnterprise: true,
            });
            expect(enterprise.valid).toEqual(
                new Set(['view:Dashboard', 'view:AiAgent']),
            );
            expect(enterprise.invalid).toEqual([]);
        });

        it('should not emit console warnings for invalid scopes', () => {
            const warnSpy = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => {});
            parseScopes({
                scopes: [
                    'export:DashboardCsv',
                    'export:DashboardPdf',
                    'export:DashboardImage',
                ],
                isEnterprise: true,
            });
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    describe('scope parsing logic', () => {
        it('should transform snake_case to PascalCase correctly', () => {
            const result = parseScopes({
                scopes: [
                    'manage:custom_sql',
                    'manage:personal_access_token',
                    'view:semantic_viewer',
                ],
                isEnterprise: true,
            });

            expect(result.valid.has('manage:CustomSql')).toBe(true);
            expect(result.valid.has('manage:PersonalAccessToken')).toBe(true);
            expect(result.valid.has('view:SemanticViewer')).toBe(true);
        });

        it('should handle camelCase input correctly', () => {
            const result = parseScopes({
                scopes: ['view:dashboard', 'manage:savedChart'],
                isEnterprise: false,
            });

            expect(result.valid.has('view:Dashboard')).toBe(true);
            expect(result.valid.has('manage:SavedChart')).toBe(true);
        });

        it('should handle mixed case input correctly', () => {
            const result = parseScopes({
                scopes: ['view:underlying_data'],
                isEnterprise: false,
            });

            expect(result.valid.has('view:UnderlyingData')).toBe(true);
        });
    });
});
