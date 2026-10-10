import { getRoleCopyScopes } from './agentCapabilityScopes';

describe('getRoleCopyScopes', () => {
    const scopes = [
        'view:AgentReadDiscover',
        'view:AgentQuery',
        'view:AgentExport',
        'view:AgentRawSql',
        'view:Dashboard',
    ];

    it('drops only Raw SQL from a system role copy without changing the source', () => {
        expect(getRoleCopyScopes('system', scopes)).toEqual([
            'view:AgentReadDiscover',
            'view:AgentQuery',
            'view:AgentExport',
            'view:Dashboard',
        ]);
        expect(scopes).toContain('view:AgentRawSql');
    });

    it('keeps all scopes from a user-owned role', () => {
        expect(getRoleCopyScopes('user', scopes)).toEqual(scopes);
    });
});
