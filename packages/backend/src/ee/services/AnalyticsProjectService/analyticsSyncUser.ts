import { Ability, AbilityBuilder } from '@casl/ability';
import { type MemberAbility, type SessionUser } from '@lightdash/common';
import { type AnalyticsSyncSystemUser } from '../../../models/AnalyticsContentSyncModel';

export const createAnalyticsSyncUser = ({
    userUuid,
    userId,
    createdAt,
    updatedAt,
    organizationUuid,
    organizationName,
    projectUuid,
}: AnalyticsSyncSystemUser & {
    organizationUuid: string;
    organizationName: string;
    projectUuid: string;
}): SessionUser => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    const project = { organizationUuid, projectUuid };
    builder.can(
        'manage',
        [
            'ContentAsCode',
            'Space',
            'SavedChart',
            'Dashboard',
            'ContentVerification',
        ],
        project,
    );
    builder.can('view', 'Project', project);
    return {
        userUuid,
        userId,
        firstName: 'Analytics system',
        lastName: '',
        organizationUuid,
        organizationName,
        createdAt,
        updatedAt,
        email: undefined,
        isActive: false,
        isSetupComplete: true,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        timezone: null,
        avatarUrl: null,
        avatarGradient: null,
        ability: builder.build(),
        abilityRules: builder.rules,
    };
};
