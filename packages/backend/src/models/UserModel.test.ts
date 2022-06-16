import { subject } from '@casl/ability';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '@lightdash/common';
import {
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common/src/types/projectMemberProfile';
import { UserModel } from './UserModel';

const orgProfile: OrganizationMemberProfile = {
    userUuid: 'user-uuid-1234',
    role: OrganizationMemberRole.VIEWER,
    email: '',
    firstName: '',
    lastName: '',
    organizationUuid: 'organization-uuid-1234',
    isActive: true,
};
const projectProfile: ProjectMemberProfile = {
    userUuid: 'user-uuid-1234',
    role: ProjectMemberRole.VIEWER,
    projectUuid: 'project-uuid-1234',
};

describe('Project member permissions', () => {
    let ability = UserModel.mergeUserAbilities(orgProfile, [projectProfile]);
    let conditions = {
        organizationUuid: orgProfile.organizationUuid,
        projectUuid: projectProfile.projectUuid,
    };
    describe('when user is an org viewer and project viewer', () => {
        beforeEach(() => {
            ability = UserModel.mergeUserAbilities(orgProfile, [
                projectProfile,
            ]);
            conditions = {
                organizationUuid: orgProfile.organizationUuid,
                projectUuid: projectProfile.projectUuid,
            };
        });

        it('can view org and project', async () => {
            expect(
                ability.can('view', subject('SavedChart', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Dashboard', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Project', { ...conditions })),
            ).toEqual(true);
        });

        it('cannot view another org or another project', async () => {
            conditions = {
                organizationUuid: 'another-org',
                projectUuid: 'another-project',
            };
            expect(
                ability.can('view', subject('SavedChart', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Dashboard', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Project', { ...conditions })),
            ).toEqual(false);
        });

        it('cannot view another org or another project', async () => {
            conditions = {
                organizationUuid: 'another-org',
                projectUuid: 'another-project',
            };
            expect(
                ability.can('view', subject('SavedChart', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Dashboard', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Project', { ...conditions })),
            ).toEqual(false);
        });
        it('cannot manage org or project', async () => {
            expect(
                ability.can('manage', subject('SavedChart', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('manage', subject('Dashboard', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('manage', subject('Project', { ...conditions })),
            ).toEqual(false);
        });
    });

    describe('when user is an org admin and project viewer', () => {
        // org admins and editors have `manage` permissions over all projects
        // within the org
        beforeEach(() => {
            const adminOrgProfile = {
                ...orgProfile,
                role: OrganizationMemberRole.ADMIN,
            };
            ability = UserModel.mergeUserAbilities(adminOrgProfile, [
                projectProfile,
            ]);
            conditions = {
                organizationUuid: orgProfile.organizationUuid,
                projectUuid: projectProfile.projectUuid,
            };
        });

        it('can view org and project', async () => {
            expect(
                ability.can('view', subject('SavedChart', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Dashboard', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Project', { ...conditions })),
            ).toEqual(true);
        });

        it('cannot view another org and or another project', async () => {
            conditions = {
                organizationUuid: 'another-org',
                projectUuid: 'another-project',
            };
            expect(
                ability.can('view', subject('SavedChart', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Dashboard', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Project', { ...conditions })),
            ).toEqual(false);
        });
        it('can manage org AND project', async () => {
            expect(
                ability.can('manage', subject('SavedChart', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Dashboard', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Project', { ...conditions })),
            ).toEqual(true);
        });
    });

    describe('when user is an org viewer and project admin', () => {
        beforeEach(() => {
            const adminProjectProfile = {
                ...projectProfile,
                role: ProjectMemberRole.ADMIN,
            };
            ability = UserModel.mergeUserAbilities(orgProfile, [
                adminProjectProfile,
            ]);
            conditions = {
                organizationUuid: orgProfile.organizationUuid,
                projectUuid: projectProfile.projectUuid,
            };
        });

        it('can view org and project', async () => {
            expect(
                ability.can('view', subject('SavedChart', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Dashboard', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('view', subject('Project', { ...conditions })),
            ).toEqual(true);
        });

        it('cannot view another org and or another project', async () => {
            conditions = {
                organizationUuid: 'another-org',
                projectUuid: 'another-project',
            };
            expect(
                ability.can('view', subject('SavedChart', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Dashboard', { ...conditions })),
            ).toEqual(false);
            expect(
                ability.can('view', subject('Project', { ...conditions })),
            ).toEqual(false);
        });
        it('cannot manage org alone but can manage project', async () => {
            // Combined
            expect(
                ability.can('manage', subject('SavedChart', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Dashboard', { ...conditions })),
            ).toEqual(true);
            expect(
                ability.can('manage', subject('Project', { ...conditions })),
            ).toEqual(true);

            // Org specific
            const orgConditions = {
                organizationUuid: conditions.organizationUuid,
            };
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { ...orgConditions }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { ...orgConditions }),
                ),
            ).toEqual(false);
            expect(
                ability.can('manage', subject('Project', { ...orgConditions })),
            ).toEqual(false);

            // Project specific
            const projectConditions = {
                projectUuid: conditions.projectUuid,
            };
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { ...projectConditions }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { ...projectConditions }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Project', { ...projectConditions }),
                ),
            ).toEqual(true);
        });
    });

    describe('when user is viewer in one project but admin in another', () => {
        const viewerProjectProfile = {
            ...projectProfile,
            role: ProjectMemberRole.VIEWER,
            projectUuid: 'project-uuid-view',
        };
        const adminProjectProfile = {
            ...projectProfile,
            role: ProjectMemberRole.ADMIN,
            projectUuid: 'project-uuid-admin',
        };
        beforeEach(() => {
            ability = UserModel.mergeUserAbilities(orgProfile, [
                viewerProjectProfile,
                adminProjectProfile,
            ]);
            conditions = {
                organizationUuid: orgProfile.organizationUuid,
                projectUuid: viewerProjectProfile.projectUuid,
            };
        });

        it('can view org and project', async () => {
            const conditionsProjectView = {
                projectUuid: viewerProjectProfile.projectUuid,
            };

            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { ...conditionsProjectView }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { ...conditionsProjectView }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Project', { ...conditionsProjectView }),
                ),
            ).toEqual(true);

            const conditionsProjectAdmin = {
                projectUuid: adminProjectProfile.projectUuid,
            };
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { ...conditionsProjectAdmin }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { ...conditionsProjectAdmin }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'view',
                    subject('Project', { ...conditionsProjectAdmin }),
                ),
            ).toEqual(true);
        });

        it('cannot view another project', async () => {
            const projectConditions = {
                projectUuid: 'another-project',
            };
            expect(
                ability.can(
                    'view',
                    subject('SavedChart', { ...projectConditions }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Dashboard', { ...projectConditions }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'view',
                    subject('Project', { ...projectConditions }),
                ),
            ).toEqual(false);
        });

        it('can manage admin project but cannot manage view project', async () => {
            const conditionsProjectView = {
                projectUuid: viewerProjectProfile.projectUuid,
            };

            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { ...conditionsProjectView }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { ...conditionsProjectView }),
                ),
            ).toEqual(false);
            expect(
                ability.can(
                    'manage',
                    subject('Project', { ...conditionsProjectView }),
                ),
            ).toEqual(false);

            const conditionsProjectAdmin = {
                projectUuid: adminProjectProfile.projectUuid,
            };
            expect(
                ability.can(
                    'manage',
                    subject('SavedChart', { ...conditionsProjectAdmin }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Dashboard', { ...conditionsProjectAdmin }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Project', { ...conditionsProjectAdmin }),
                ),
            ).toEqual(true);
        });
    });
});
