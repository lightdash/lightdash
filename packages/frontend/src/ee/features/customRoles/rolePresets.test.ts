import { getScopes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getRolePresetScopes,
    isRolePresetAssignableAtLevel,
    rolePresets,
} from './rolePresets';

describe('rolePresets', () => {
    it('defines the five presets in display order with exact seed values', () => {
        expect(rolePresets).toEqual([
            {
                title: 'Roadmap viewer',
                description:
                    "View the organization's enterprise roadmap without organization administration permissions.",
                scopes: ['view:Roadmap'],
            },
            {
                title: 'SQL Runner user',
                description:
                    'Run warehouse SQL through SQL Runner, AI agents, and MCP without project deployment or SQL-authoring permissions.',
                scopes: ['manage:SqlRunner'],
            },
            {
                title: 'SQL author',
                description:
                    'Run warehouse SQL and author SQL charts, custom SQL dimensions, and SQL table calculations.',
                scopes: [
                    'manage:SqlRunner',
                    'manage:CustomSql',
                    'manage:CustomFields',
                    'manage:CustomSqlTableCalculations',
                    'view:CompiledSql',
                ],
            },
            {
                title: 'Data App builder',
                description:
                    'Create Data Apps and manage the apps you build, including in production projects.',
                scopes: ['create:DataApp'],
            },
            {
                title: 'AI agent manager',
                description:
                    'Create and manage all AI agents and their knowledge documents in assigned projects.',
                scopes: ['manage:AiAgent', 'manage:AiAgentDocument'],
            },
        ]);
    });

    it('only references scopes in the current authorization catalog', () => {
        const scopeNames = new Set(
            getScopes({ isEnterprise: true }).map(({ name }) => name),
        );

        expect(
            rolePresets
                .flatMap(({ scopes }) => scopes)
                .every((scope) => scopeNames.has(scope)),
        ).toBe(true);
    });

    it('excludes organization-only presets from project roles', () => {
        expect(
            rolePresets
                .filter((preset) =>
                    isRolePresetAssignableAtLevel(preset, 'project'),
                )
                .map(({ title }) => title),
        ).toEqual([
            'SQL Runner user',
            'SQL author',
            'Data App builder',
            'AI agent manager',
        ]);

        expect(
            rolePresets.every((preset) =>
                isRolePresetAssignableAtLevel(preset, 'organization'),
            ),
        ).toBe(true);
    });

    it('expands and deduplicates scope dependencies', () => {
        const preset = rolePresets.find(
            ({ title }) => title === 'SQL Runner user',
        );
        expect(preset).toBeDefined();
        if (!preset) {
            return;
        }

        expect(getRolePresetScopes(preset, 'project')).toEqual([
            'manage:SqlRunner',
            'view:Project',
            'create:Job',
            'manage:CompileProject',
        ]);
    });
});
