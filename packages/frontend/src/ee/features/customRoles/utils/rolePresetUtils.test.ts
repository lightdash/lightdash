import { rolePresets } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getNewRoleAgentScopes, getRolePresetScopes } from './rolePresetUtils';

describe('new role agent scopes', () => {
    it('defaults to Read, Query and Export when enabled', () => {
        expect(getNewRoleAgentScopes(true)).toEqual([
            'view:AgentReadDiscover',
            'view:AgentQuery',
            'view:AgentExport',
        ]);
    });

    it('has no agent defaults when disabled', () => {
        expect(getNewRoleAgentScopes(false)).toEqual([]);
    });

    it.each(rolePresets)(
        'defaults to exactly Read, Query and Export for $title at its own level when enabled',
        (preset) => {
            const scopes = getRolePresetScopes(preset, preset.level, true);
            expect(
                scopes.filter((scope) => scope.startsWith('view:Agent')),
            ).toEqual([
                'view:AgentReadDiscover',
                'view:AgentQuery',
                'view:AgentExport',
            ]);
            expect(scopes).not.toContain('view:AgentRawSql');
        },
    );

    it.each(rolePresets)(
        'has no agent scopes for $title at its own level when disabled',
        (preset) => {
            const scopes = getRolePresetScopes(preset, preset.level, false);
            expect(
                scopes.filter((scope) => scope.startsWith('view:Agent')),
            ).toEqual([]);
        },
    );
});

describe('getRolePresetScopes', () => {
    it('expands and deduplicates scope dependencies', () => {
        expect(getRolePresetScopes(rolePresets[1], 'project')).toEqual([
            'manage:SqlRunner',
            'view:Project',
            'create:Job',
            'manage:CompileProject',
        ]);
    });
});
