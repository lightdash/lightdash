import { ParameterError } from '../types/errors';
import { parseScopes } from './parseScopes';

describe('parseScopes', () => {
    describe('with valid scopes', () => {
        it('should return a Set of valid scope names for non-enterprise', () => {
            const result = parseScopes({
                scopes: ['view:dashboard', 'manage:dashboard'],
                isEnterprise: false,
            });

            expect(result).toBeInstanceOf(Set);
            expect(result.size).toBe(2);
            expect(result.has('view:Dashboard')).toBe(true);
            expect(result.has('manage:Dashboard')).toBe(true);
        });

        it('should return a Set of valid scope names for enterprise', () => {
            const result = parseScopes({
                scopes: ['view:ai_agent', 'manage:ai_agent'],
                isEnterprise: true,
            });

            expect(result).toBeInstanceOf(Set);
            expect(result.size).toBe(2);
            expect(result.has('view:AiAgent')).toBe(true);
            expect(result.has('manage:AiAgent')).toBe(true);
        });

        it('should handle mixed case scope names correctly', () => {
            const result = parseScopes({
                scopes: [
                    'export:dashboard_csv',
                    'manage:personal_access_token',
                ],
                isEnterprise: true,
            });

            expect(result.size).toBe(2);
            expect(result.has('export:DashboardCsv')).toBe(true);
            expect(result.has('manage:PersonalAccessToken')).toBe(true);
        });

        it('should handle single scope correctly', () => {
            const result = parseScopes({
                scopes: ['view:project'],
                isEnterprise: false,
            });

            expect(result.size).toBe(1);
            expect(result.has('view:Project')).toBe(true);
        });

        it('should handle empty scopes array', () => {
            const result = parseScopes({
                scopes: [],
                isEnterprise: false,
            });

            expect(result).toBeInstanceOf(Set);
            expect(result.size).toBe(0);
        });
    });

    describe('with invalid scopes', () => {
        it('should throw ParameterError for invalid scope name', () => {
            expect(() =>
                parseScopes({
                    scopes: ['view:dashboard', 'invalid:scope'],
                    isEnterprise: false,
                }),
            ).toThrow(ParameterError);

            expect(() =>
                parseScopes({
                    scopes: ['view:dashboard', 'invalid:scope'],
                    isEnterprise: false,
                }),
            ).toThrow(
                'Invalid scope: invalid:Scope. Please check the scope name and try again.',
            );
        });

        it('should throw ParameterError for enterprise scope when not enterprise', () => {
            expect(() =>
                parseScopes({
                    scopes: ['view:dashboard', 'view:ai_agent'],
                    isEnterprise: false,
                }),
            ).toThrow(ParameterError);

            expect(() =>
                parseScopes({
                    scopes: ['view:dashboard', 'view:ai_agent'],
                    isEnterprise: false,
                }),
            ).toThrow(
                'Invalid scope: view:AiAgent. Please check the scope name and try again.',
            );
        });
    });

    describe('scope parsing logic', () => {
        it('should transform snake_case to PascalCase correctly', () => {
            const result = parseScopes({
                scopes: [
                    'export:dashboard_csv',
                    'manage:personal_access_token',
                    'view:semantic_viewer',
                ],
                isEnterprise: true,
            });

            expect(result.has('export:DashboardCsv')).toBe(true);
            expect(result.has('manage:PersonalAccessToken')).toBe(true);
            expect(result.has('view:SemanticViewer')).toBe(true);
        });

        it('should handle camelCase input correctly', () => {
            const result = parseScopes({
                scopes: ['view:dashboard', 'manage:savedChart'],
                isEnterprise: false,
            });

            expect(result.has('view:Dashboard')).toBe(true);
            expect(result.has('manage:SavedChart')).toBe(true);
        });

        it('should handle mixed case input correctly', () => {
            const result = parseScopes({
                scopes: ['view:underlying_data'],
                isEnterprise: false,
            });

            expect(result.has('view:UnderlyingData')).toBe(true);
        });
    });
});
