import { assertUnreachable, type McpProjectAccess } from '@lightdash/common';

export const isProjectAllowedForMcp = (
    policy: McpProjectAccess,
    projectUuid: string,
): boolean => {
    switch (policy.mode) {
        case 'all':
            return true;
        case 'selected':
            return policy.projectUuids.includes(projectUuid);
        default:
            return assertUnreachable(policy, 'Unknown MCP project access mode');
    }
};

export const isSameMcpProjectAccess = (
    a: McpProjectAccess,
    b: McpProjectAccess,
): boolean => {
    switch (a.mode) {
        case 'all':
            return b.mode === 'all';
        case 'selected': {
            if (b.mode !== 'selected') return false;
            const aProjects = new Set(a.projectUuids);
            const bProjects = new Set(b.projectUuids);
            return (
                aProjects.size === bProjects.size &&
                [...aProjects].every((uuid) => bProjects.has(uuid))
            );
        }
        default:
            return assertUnreachable(a, 'Unknown MCP project access mode');
    }
};
