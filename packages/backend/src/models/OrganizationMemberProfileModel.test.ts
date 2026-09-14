import { OrganizationMemberRole } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { UserTableName } from '../database/entities/users';
import { OrganizationMemberProfileModel } from './OrganizationMemberProfileModel';

describe('OrganizationMemberProfileModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OrganizationMemberProfileModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('findOrganizationMembersByEmails', () => {
        it('does not query for an empty email list', async () => {
            await expect(
                model.findOrganizationMembersByEmails('organization-uuid', []),
            ).resolves.toEqual([]);
            expect(tracker.history.select).toHaveLength(0);
        });

        it('normalizes emails and returns every matching member', async () => {
            const now = new Date('2026-01-01T00:00:00.000Z');
            tracker.on.select(OrganizationMembershipsTableName).responseOnce([
                {
                    user_uuid: 'user-1',
                    user_created_at: now,
                    user_updated_at: now,
                    first_name: 'First',
                    last_name: 'Member',
                    is_active: true,
                    email: 'member@example.com',
                    organization_uuid: 'organization-uuid',
                    role: OrganizationMemberRole.MEMBER,
                    role_uuid: null,
                    expires_at: undefined,
                    avatar_gradient: null,
                    avatar_content_hash: null,
                },
                {
                    user_uuid: 'user-2',
                    user_created_at: now,
                    user_updated_at: now,
                    first_name: 'Duplicate',
                    last_name: 'Member',
                    is_active: true,
                    email: 'MEMBER@example.com',
                    organization_uuid: 'organization-uuid',
                    role: OrganizationMemberRole.MEMBER,
                    role_uuid: null,
                    expires_at: undefined,
                    avatar_gradient: null,
                    avatar_content_hash: null,
                },
            ]);
            tracker.on.select(UserTableName).responseOnce([
                { user_uuid: 'user-1', has_authentication: true },
                { user_uuid: 'user-2', has_authentication: true },
            ]);

            const members = await model.findOrganizationMembersByEmails(
                'organization-uuid',
                [' MEMBER@example.com ', 'member@example.com'],
            );

            expect(members).toHaveLength(2);
            const memberQuery = tracker.history.select[0];
            expect(memberQuery.sql).toContain('LOWER');
            expect(memberQuery.sql).toContain('"users"."is_internal"');
            expect(memberQuery.bindings).toContain('organization-uuid');
            expect(memberQuery.bindings).toContainEqual(['member@example.com']);
        });
    });

    describe('updateOrganizationMember', () => {
        it('clears extra custom roles when the system role is written', async () => {
            tracker.on.select(OrganizationMembershipsTableName).response([
                {
                    organization_id: 3,
                    user_id: 7,
                    role: OrganizationMemberRole.VIEWER,
                    role_uuid: null,
                },
            ]);
            tracker.on.update(OrganizationMembershipsTableName).response(1);
            tracker.on
                .delete(OrganizationMembershipCustomRolesTableName)
                .response(0);
            const getMember = vi
                .spyOn(model, 'getOrganizationMemberByUuid')
                .mockResolvedValue({} as never);

            await model.updateOrganizationMember('org-uuid', 'user-uuid', {
                role: OrganizationMemberRole.EDITOR,
            });

            const [clear] = tracker.history.delete;
            expect(clear.sql).toContain(
                OrganizationMembershipCustomRolesTableName,
            );
            expect(clear.bindings).toEqual([3, 7]);
            getMember.mockRestore();
        });
    });
});
