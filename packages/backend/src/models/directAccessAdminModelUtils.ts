import {
    DirectAccessOrigin,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type SpaceMemberRole,
} from '@lightdash/common';
import type { Knex } from 'knex';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import {
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
} from './directAccessModelUtils';
import { getColumnMatchRegexQuery } from './SearchModel/utils/search';

export type DirectAccessListRow =
    | {
          origin: DirectAccessOrigin.USER;
          principalUuid: string;
          firstName: string;
          lastName: string;
          email: string;
          isInternal: boolean;
          directRole: SpaceMemberRole;
      }
    | {
          origin: DirectAccessOrigin.GROUP;
          principalUuid: string;
          name: string;
          directRole: SpaceMemberRole;
      };

export type DirectAccessAdminTableConfig = {
    userAccessTable: string;
    groupAccessTable: string;
    resourceColumn: string;
};

type DirectAccessAdminContext = {
    resourceUuid: string;
    organizationUuid: string;
    projectUuid: string;
};

type Principal =
    | { origin: DirectAccessOrigin.USER; uuid: string }
    | { origin: DirectAccessOrigin.GROUP; uuid: string };

const joinProject = (join: Knex.JoinClause, projectUuid: string): void => {
    join.onVal(`${ProjectTableName}.project_uuid`, projectUuid);
};

export const getDirectAccessList = async (
    database: Knex,
    config: DirectAccessAdminTableConfig,
    context: DirectAccessAdminContext,
    {
        paginateArgs,
        searchQuery,
        principal,
    }: {
        paginateArgs?: KnexPaginateArgs;
        searchQuery?: string;
        principal?: Principal;
    } = {},
): Promise<KnexPaginatedData<DirectAccessListRow[]>> => {
    const users = database(config.userAccessTable)
        .innerJoin(
            UserTableName,
            `${UserTableName}.user_uuid`,
            `${config.userAccessTable}.user_uuid`,
        )
        .innerJoin(ProjectTableName, (join) =>
            joinProject(join, context.projectUuid),
        )
        .innerJoin(
            OrganizationMembershipsTableName,
            function joinCurrentOrganizationMembership() {
                this.on(
                    `${OrganizationMembershipsTableName}.user_id`,
                    `${UserTableName}.user_id`,
                ).andOn(
                    `${OrganizationMembershipsTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                );
            },
        )
        .innerJoin(
            OrganizationTableName,
            `${OrganizationTableName}.organization_id`,
            `${ProjectTableName}.organization_id`,
        )
        .leftJoin(EmailTableName, function joinPrimaryEmail() {
            this.on(
                `${EmailTableName}.user_id`,
                `${UserTableName}.user_id`,
            ).andOnVal(`${EmailTableName}.is_primary`, true);
        })
        .where(
            `${config.userAccessTable}.${config.resourceColumn}`,
            context.resourceUuid,
        )
        .where(
            `${OrganizationTableName}.organization_uuid`,
            context.organizationUuid,
        )
        .where(getActiveProjectMemberPredicate(database))
        .select({
            origin: database.raw('?', [DirectAccessOrigin.USER]),
            principalUuid: `${config.userAccessTable}.user_uuid`,
            firstName: `${UserTableName}.first_name`,
            lastName: `${UserTableName}.last_name`,
            email: database.raw('COALESCE(??, ?)', [
                `${EmailTableName}.email`,
                '',
            ]),
            isInternal: `${UserTableName}.is_internal`,
            name: database.raw('NULL::text'),
            directRole: `${config.userAccessTable}.space_role`,
        });
    const groups = database(config.groupAccessTable)
        .innerJoin(ProjectTableName, (join) =>
            joinProject(join, context.projectUuid),
        )
        .innerJoin(
            OrganizationTableName,
            `${OrganizationTableName}.organization_id`,
            `${ProjectTableName}.organization_id`,
        )
        .innerJoin(GroupTableName, function joinOrganizationGroup() {
            this.on(
                `${GroupTableName}.group_uuid`,
                `${config.groupAccessTable}.group_uuid`,
            ).andOn(
                `${GroupTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            );
        })
        .where(
            `${config.groupAccessTable}.${config.resourceColumn}`,
            context.resourceUuid,
        )
        .where(
            `${OrganizationTableName}.organization_uuid`,
            context.organizationUuid,
        )
        .where(
            getActiveGrantedGroupPredicate(database, config.groupAccessTable),
        )
        .select({
            origin: database.raw('?', [DirectAccessOrigin.GROUP]),
            principalUuid: `${config.groupAccessTable}.group_uuid`,
            firstName: database.raw('NULL::text'),
            lastName: database.raw('NULL::text'),
            email: database.raw('NULL::text'),
            isInternal: database.raw('NULL::boolean'),
            name: `${GroupTableName}.name`,
            directRole: `${config.groupAccessTable}.space_role`,
        });

    let query = database
        .select<DirectAccessListRow[]>('*')
        .from(users.unionAll(groups).as('direct_access'));
    if (searchQuery) {
        query = getColumnMatchRegexQuery(query, searchQuery, [
            'firstName',
            'lastName',
            'email',
            'name',
        ]);
    }
    if (principal) {
        void query
            .where('origin', principal.origin)
            .where('principalUuid', principal.uuid);
    }
    void query
        .orderByRaw('LOWER(COALESCE(??, ??, ?))', ['name', 'firstName', ''])
        .orderBy('origin')
        .orderBy('principalUuid');

    return KnexPaginate.paginate(query, paginateArgs);
};

export const getDirectAccessGroupRolesForUsers = async (
    database: Knex,
    config: DirectAccessAdminTableConfig,
    context: DirectAccessAdminContext,
    userUuids: string[],
): Promise<Record<string, SpaceMemberRole[]>> => {
    if (userUuids.length === 0) return {};
    const rows = await database(config.groupAccessTable)
        .innerJoin(
            GroupMembershipTableName,
            `${GroupMembershipTableName}.group_uuid`,
            `${config.groupAccessTable}.group_uuid`,
        )
        .innerJoin(
            UserTableName,
            `${UserTableName}.user_id`,
            `${GroupMembershipTableName}.user_id`,
        )
        .innerJoin(ProjectTableName, (join) =>
            joinProject(join, context.projectUuid),
        )
        .innerJoin(
            OrganizationMembershipsTableName,
            function joinCurrentOrganizationMembership() {
                this.on(
                    `${OrganizationMembershipsTableName}.user_id`,
                    `${UserTableName}.user_id`,
                ).andOn(
                    `${OrganizationMembershipsTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                );
            },
        )
        .innerJoin(
            OrganizationTableName,
            `${OrganizationTableName}.organization_id`,
            `${ProjectTableName}.organization_id`,
        )
        .where(
            `${config.groupAccessTable}.${config.resourceColumn}`,
            context.resourceUuid,
        )
        .whereIn(`${UserTableName}.user_uuid`, userUuids)
        .where(
            `${OrganizationTableName}.organization_uuid`,
            context.organizationUuid,
        )
        .where(
            `${GroupMembershipTableName}.organization_id`,
            database.ref(`${ProjectTableName}.organization_id`),
        )
        .where(getActiveProjectMemberPredicate(database))
        .where(
            getActiveGrantedGroupPredicate(database, config.groupAccessTable),
        )
        .select<{ userUuid: string; role: SpaceMemberRole }[]>({
            userUuid: `${UserTableName}.user_uuid`,
            role: `${config.groupAccessTable}.space_role`,
        });

    const rolesByUserUuid: Record<string, SpaceMemberRole[]> = {};
    for (const { userUuid, role } of rows) {
        rolesByUserUuid[userUuid] = [
            ...(rolesByUserUuid[userUuid] ?? []),
            role,
        ];
    }
    return rolesByUserUuid;
};
