import { subject } from '@casl/ability';
import { createAnalyticsSyncUser } from './analyticsSyncUser';

const project = {
    organizationUuid: 'organization',
    organizationName: 'Organization',
    projectUuid: 'analytics-project',
};

const user = createAnalyticsSyncUser({
    ...project,
    userUuid: 'persisted-system-user',
    userId: 12,
    createdAt: new Date('2026-11-03T00:00:00Z'),
    updatedAt: new Date('2026-11-03T00:00:00Z'),
});

describe('analytics sync worker authority', () => {
    it('allows managed content and verification in restricted analytics spaces', () => {
        const context = {
            organizationUuid: project.organizationUuid,
            projectUuid: project.projectUuid,
            inheritsFromOrgOrProject: false,
            access: [],
            admins: [],
        };
        for (const type of [
            'ContentAsCode',
            'Space',
            'SavedChart',
            'Dashboard',
            'ContentVerification',
        ] as const) {
            expect(
                user.ability.can('manage', subject(type, { ...context })),
            ).toBe(true);
        }
        expect(
            user.ability.can('view', subject('Project', { ...context })),
        ).toBe(true);
    });

    it('cannot act in another project or administer the organization', () => {
        for (const type of [
            'ContentAsCode',
            'Space',
            'SavedChart',
            'Dashboard',
            'ContentVerification',
            'Project',
        ] as const) {
            expect(
                user.ability.can(
                    'manage',
                    subject(type, {
                        ...project,
                        projectUuid: 'another-project',
                    }),
                ),
            ).toBe(false);
            expect(
                user.ability.can(
                    'manage',
                    subject(type, {
                        ...project,
                        organizationUuid: 'another-organization',
                    }),
                ),
            ).toBe(false);
        }
        expect(
            user.ability.can('manage', subject('Organization', { ...project })),
        ).toBe(false);
        expect(
            user.ability.can('manage', subject('Project', { ...project })),
        ).toBe(false);
        expect(
            user.ability.can(
                'view',
                subject('Project', {
                    ...project,
                    projectUuid: 'another-project',
                }),
            ),
        ).toBe(false);
    });

    it('attributes writes to the persisted inactive worker without claiming token authentication', () => {
        expect(user).toMatchObject({
            userUuid: 'persisted-system-user',
            userId: 12,
            firstName: 'Analytics system',
            isActive: false,
            createdAt: new Date('2026-11-03T00:00:00Z'),
        });
        expect(user.email).toBeUndefined();
        expect(user).not.toHaveProperty('serviceAccount');
        expect(user).not.toHaveProperty('impersonation');
        expect(user).not.toHaveProperty('role');
    });
});
