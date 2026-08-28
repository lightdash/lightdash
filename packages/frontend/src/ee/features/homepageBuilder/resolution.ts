import {
    assertUnreachable,
    ProjectMemberRoleLabels,
    type HomepageViewAsReason,
} from '@lightdash/common';

export const RESOLUTION_STEPS = ['Group priority', 'Role', 'Project default'];

export const reasonLabel = (
    reason: HomepageViewAsReason,
    groupNames: Map<string, string>,
): string => {
    switch (reason.type) {
        case 'group':
            return `via group ${groupNames.get(reason.groupUuid) ?? 'unknown'} (priority ${reason.priority})`;
        case 'role':
            return `via role ${ProjectMemberRoleLabels[reason.role]}`;
        case 'default':
            return 'project default';
        default:
            return assertUnreachable(reason, 'Unknown view-as reason');
    }
};
