import {
    assertUnreachable,
    ProjectMemberRoleLabels,
    type HomepageViewAsReason,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

const ns = 'homepageBuilder';

export const getResolutionSteps = (): string[] => [
    i18n.t('resolution.steps.groupPriority', { ns }),
    i18n.t('resolution.steps.role', { ns }),
    i18n.t('resolution.steps.projectDefault', { ns }),
];

export const reasonLabel = (
    reason: HomepageViewAsReason,
    groupNames: Map<string, string>,
): string => {
    switch (reason.type) {
        case 'group':
            return i18n.t('resolution.reason.group', {
                ns,
                group:
                    groupNames.get(reason.groupUuid) ??
                    i18n.t('resolution.reason.unknownGroup', { ns }),
                priority: reason.priority,
            });
        case 'role':
            return i18n.t('resolution.reason.role', {
                ns,
                role: ProjectMemberRoleLabels[reason.role],
            });
        case 'default':
            return i18n.t('resolution.reason.default', { ns });
        default:
            return assertUnreachable(reason, 'Unknown view-as reason');
    }
};
