import { subject } from '@casl/ability';
import { defineUserAbility } from './index';
import {
    adminOrgProfile,
    adminProjectProfile,
    conditions as defaultConditions,
    orgProfile,
    projectProfile,
} from './index.mock';

describe('Lightdash member permissions', () => {
    let ability = defineUserAbility(orgProfile, [projectProfile]);
    let conditions = defaultConditions;
    describe('when user is an org viewer and project viewer', () => {
        beforeEach(() => {
            ability = defineUserAbility(orgProfile, [projectProfile]);
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
                projectUuid: 'another-project',
                organizationUuid: 'another-org',
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

        it('cannot view another org', async () => {
            conditions = {
                ...defaultConditions,
                organizationUuid: 'another-org',
            };
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

        it('cannot view another project', async () => {
            conditions = {
                ...defaultConditions,
                projectUuid: 'another-project',
            };
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
            ability = defineUserAbility(adminOrgProfile, [projectProfile]);
            conditions = {
                organizationUuid: adminOrgProfile.organizationUuid,
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
            ability = defineUserAbility(orgProfile, [adminProjectProfile]);
            conditions = {
                organizationUuid: orgProfile.organizationUuid,
                projectUuid: adminProjectProfile.projectUuid,
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
        beforeEach(() => {
            ability = defineUserAbility(orgProfile, [
                projectProfile,
                adminProjectProfile,
            ]);
            conditions = {
                organizationUuid: orgProfile.organizationUuid,
                projectUuid: projectProfile.projectUuid,
            };
        });

        it('can view org and project', async () => {
            const conditionsProjectView = {
                projectUuid: projectProfile.projectUuid,
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
                projectUuid: projectProfile.projectUuid,
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

    describe('when user is an org admin and has no project roles', () => {
        // org admins and editors have `manage` permissions over all projects
        // within the org
        beforeEach(() => {
            ability = defineUserAbility(adminOrgProfile, []);
        });

        it('can view project', async () => {
            expect(ability.can('manage', 'Project')).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Project', {
                        organizationUuid: orgProfile.organizationUuid,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Project', {
                        projectUuid: projectProfile.projectUuid,
                    }),
                ),
            ).toEqual(true);
            expect(
                ability.can(
                    'manage',
                    subject('Project', {
                        organizationUuid: orgProfile.organizationUuid,
                        projectUuid: projectProfile.projectUuid,
                    }),
                ),
            ).toEqual(true);
        });
    });
});
