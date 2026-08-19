import {
    isScopeAssignableAtLevel,
    type RoleLevel,
    type ScopeName,
} from '@lightdash/common';
import { getScopeNamesWithDependencies } from './utils/scopeUtils';

export type RolePreset = {
    title: string;
    description: string;
    scopes: ScopeName[];
};

export const rolePresets = [
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
] satisfies RolePreset[];

export const isRolePresetAssignableAtLevel = (
    preset: RolePreset,
    level: RoleLevel,
): boolean =>
    preset.scopes.every((scope) => isScopeAssignableAtLevel(scope, level));

export const getRolePresetScopes = (
    preset: RolePreset,
    level: RoleLevel,
): ScopeName[] => [
    ...new Set(
        preset.scopes
            .flatMap(getScopeNamesWithDependencies)
            .filter((scope) => isScopeAssignableAtLevel(scope, level)),
    ),
];
