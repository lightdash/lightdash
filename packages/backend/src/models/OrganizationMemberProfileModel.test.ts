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

    describe.each([false, true])(
        'user search with groups=%s',
        (includeGroups) => {
            const search = (searchQuery: string) =>
                includeGroups
                    ? model.getOrganizationMembersAndGroups(
                          'organization-uuid',
                          100,
                          undefined,
                          searchQuery,
                      )
                    : model.getOrganizationMembers({
                          organizationUuid: 'organization-uuid',
                          searchQuery,
                      });

            beforeEach(() => {
                tracker.on.select(/.*/).response([]);
            });

            it('matches the whole phrase and searches primary and additional custom roles', async () => {
                await search('  Search   Analyst  ');
                const query = tracker.history.select[0];
                expect(query.bindings).toContain('%Search Analyst%');
                expect(query.bindings).not.toContain('Search|Analyst');
                expect(query.sql).toContain('concat_ws');
                expect(query.sql).toContain('"roles"."name" ilike');
                expect(query.sql).toContain(
                    '"roles"."role_uuid" = "organization_memberships"."role_uuid"',
                );
                expect(query.sql).toContain(
                    '"organization_membership_custom_roles"."user_id" = "organization_memberships"."user_id"',
                );
                expect(query.sql).toContain(
                    '"roles"."organization_uuid" = "organizations"."organization_uuid"',
                );
            });

            it('treats SQL wildcards and backslashes literally', async () => {
                await search('Role_%\\test');
                expect(tracker.history.select[0].bindings).toContain(
                    '%Role\\_\\%\\\\test%',
                );
            });

            it('ignores whitespace-only queries', async () => {
                await search('   ');
                expect(tracker.history.select[0].sql).not.toContain('ilike');
            });
        },
    );

    describe.each([false, true])(
        'member sort with groups=%s',
        (includeGroups) => {
            const list = (sortDirection?: 'asc' | 'desc') => {
                const memberSort = sortDirection
                    ? { sortBy: 'name' as const, sortDirection }
                    : undefined;
                return includeGroups
                    ? model.getOrganizationMembersAndGroups(
                          'organization-uuid',
                          100,
                          undefined,
                          undefined,
                          undefined,
                          memberSort,
                      )
                    : model.getOrganizationMembers({
                          organizationUuid: 'organization-uuid',
                          memberSort,
                      });
            };

            beforeEach(() => {
                tracker.on.select(/.*/).response([]);
            });

            it.each(['asc', 'desc'] as const)(
                'orders by display name, falling back to email (%s)',
                async (direction) => {
                    await list(direction);
                    expect(tracker.history.select[0].sql).toContain(
                        `order by lower(coalesce(nullif(trim(concat_ws(' ', "users"."first_name", "users"."last_name")), ''), "emails"."email")) ${direction}, "users"."user_uuid" ${direction}`,
                    );
                },
            );

            it('keeps the default order when no sort is requested', async () => {
                await list();
                expect(tracker.history.select[0].sql).not.toContain('order by');
            });
        },
    );

    it('prefers an explicit column sort over member sort', async () => {
        tracker.on.select(/.*/).response([]);
        await model.getOrganizationMembers({
            organizationUuid: 'organization-uuid',
            sort: { column: 'users.updated_at', direction: 'asc' },
            memberSort: { sortBy: 'name', sortDirection: 'desc' },
        });
        const { sql } = tracker.history.select[0];
        expect(sql).toContain('order by "users"."updated_at" asc');
        expect(sql).not.toContain('concat_ws');
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
