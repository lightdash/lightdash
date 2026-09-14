import { describe, expect, it } from 'vitest';
import { isRolePresetAvailableAtLevel, rolePresets } from './rolePresets';
import { getScopes } from './scopes';

describe('rolePresets', () => {
    it('defines the five presets in display order with exact seed values', () => {
        expect(rolePresets).toEqual([
            {
                title: 'Roadmap viewer',
                description:
                    "View the organization's enterprise roadmap without organization administration permissions.",
                level: 'organization',
                scopes: ['view:Roadmap'],
            },
            {
                title: 'SQL Runner user',
                description:
                    'Run warehouse SQL through SQL Runner, AI agents, and MCP without project deployment or SQL-authoring permissions.',
                level: 'project',
                scopes: ['manage:SqlRunner'],
            },
            {
                title: 'SQL author',
                description:
                    'Run warehouse SQL and author SQL charts, custom SQL dimensions, and SQL table calculations.',
                level: 'project',
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
                level: 'project',
                scopes: ['create:DataApp'],
            },
            {
                title: 'AI agent manager',
                description:
                    'Create and manage all AI agents and their knowledge documents in assigned projects.',
                level: 'project',
                scopes: ['manage:AiAgent', 'manage:AiAgentDocument'],
            },
        ]);
    });

    it('only references scopes in the authorization catalog', () => {
        const scopeNames = new Set(
            getScopes({ isEnterprise: true }).map(({ name }) => name),
        );

        expect(
            rolePresets
                .flatMap(({ scopes }) => scopes)
                .every((scope) => scopeNames.has(scope)),
        ).toBe(true);
    });

    it('only makes presets available at their intended role level', () => {
        expect(
            rolePresets
                .filter((preset) =>
                    isRolePresetAvailableAtLevel(preset, 'project'),
                )
                .map(({ title }) => title),
        ).toEqual([
            'SQL Runner user',
            'SQL author',
            'Data App builder',
            'AI agent manager',
        ]);

        expect(
            rolePresets
                .filter((preset) =>
                    isRolePresetAvailableAtLevel(preset, 'organization'),
                )
                .map(({ title }) => title),
        ).toEqual(['Roadmap viewer']);
    });
});
