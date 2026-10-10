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

    it.each(rolePresets)('does not default Raw SQL for $title', (preset) => {
        expect(getRolePresetScopes(preset, 'project', true)).not.toContain(
            'view:AgentRawSql',
        );
    });
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
