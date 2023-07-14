import {
    ChartConfig,
    ChartKind,
    ChartType,
    CreateOrgAttribute,
    getChartType,
    NotFoundError,
    OrganizationMemberRole,
    OrgAttribute,
    ProjectMemberRole,
    Space,
    SpaceDashboard,
    SpaceQuery,
    SpaceShare,
    SpaceSummary,
    UpdateSpace,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Knex } from 'knex';
import { getProjectRoleOrInheritedFromOrganization } from '../controllers/authenticationRoles';
import {
    AnalyticsChartViewsTableName,
    AnalyticsDashboardViewsTableName,
} from '../database/entities/analytics';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import {
    DbPinnedList,
    DBPinnedSpace,
    PinnedChartTableName,
    PinnedDashboardTableName,
    PinnedListTableName,
    PinnedSpaceTableName,
} from '../database/entities/pinnedList';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { DbProject, ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import {
    DbSpace,
    SpaceShareTableName,
    SpaceTableName,
} from '../database/entities/spaces';
import {
    DbOrganizationMemberUserAttribute,
    DbUserAttribute,
    OrganizationMemberUserAttributesTable,
    UserAttributesTable,
} from '../database/entities/userAttributes';
import { UserTableName } from '../database/entities/users';
import { DbValidationTable } from '../database/entities/validation';
import { GetDashboardDetailsQuery } from './DashboardModel/DashboardModel';

type Dependencies = {
    database: Knex;
};

const sampleAttribute = {
    uuid: 'string',
    createdAt: new Date(),
    name: 'string',
    organizationUuid: 'string',
    description: 'string',
    users: [],
};
export class UserAttributesModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async find(filters: {
        organizationUuid?: string;
        userAttributeUuid?: string;
    }): Promise<OrgAttribute[]> {
        const query = this.database(UserAttributesTable)
            .leftJoin(
                OrganizationMemberUserAttributesTable,
                `${OrganizationMemberUserAttributesTable}.user_attribute_uuid`,
                `${UserAttributesTable}.user_attribute_uuid`,
            )
            .leftJoin(
                `emails`,
                `${OrganizationMemberUserAttributesTable}.user_id`,
                `emails.user_id`,
            )
            .select<
                (DbUserAttribute &
                    DbOrganizationMemberUserAttribute & { email: string })[]
            >(
                `${UserAttributesTable}.*`,
                `${OrganizationMemberUserAttributesTable}.user_id`,
                `${OrganizationMemberUserAttributesTable}.value`,
                `emails.email`,
            );

        if (filters.organizationUuid) {
            query.where(
                `${UserAttributesTable}.organization_uuid`,
                filters.organizationUuid,
            );
        }
        if (filters.userAttributeUuid) {
            query.where(
                `${UserAttributesTable}.user_attribute_uuid`,
                filters.userAttributeUuid,
            );
        }

        const orgAttributes = await query;

        const results = orgAttributes.reduce<Record<string, OrgAttribute>>(
            (acc, orgAttribute) => {
                if (
                    acc[orgAttribute.user_attribute_uuid] &&
                    orgAttribute.user_id
                ) {
                    acc[orgAttribute.user_attribute_uuid].users.push({
                        userId: orgAttribute.user_id,
                        value: orgAttribute.value,
                        email: orgAttribute.email,
                    });
                    return acc;
                }
                return {
                    ...acc,
                    [orgAttribute.user_attribute_uuid]: {
                        uuid: orgAttribute.user_attribute_uuid,
                        createdAt: orgAttribute.created_at,
                        name: orgAttribute.name,
                        organizationUuid: orgAttribute.organization_uuid,
                        description: orgAttribute.description,
                        users: orgAttribute.user_id
                            ? [
                                  {
                                      userId: orgAttribute.user_id,
                                      value: orgAttribute.value,
                                      email: orgAttribute.email,
                                  },
                              ]
                            : [],
                    },
                };
            },
            {},
        );

        return Object.values(results);
    }

    async get(userAttributeUuid: string): Promise<OrgAttribute> {
        const [result] = await this.find({ userAttributeUuid });
        return result;
    }

    async create(
        organizationUuid: string,
        orgAttribute: CreateOrgAttribute,
    ): Promise<OrgAttribute> {
        const [organization] = await this.database(OrganizationTableName)
            .select('organization_id')
            .where('organization_uuid', organizationUuid);

        const attributeUuid = await this.database.transaction(async (trx) => {
            const [inserted] = await trx(UserAttributesTable)
                .insert({
                    name: orgAttribute.name,
                    description: orgAttribute.description,
                    organization_uuid: organizationUuid,
                })
                .returning('*');

            const promises = orgAttribute.users.map(async (userAttr) =>
                trx(OrganizationMemberUserAttributesTable).insert({
                    user_id: userAttr.userId,
                    organization_id: organization.organization_id,
                    user_attribute_uuid: inserted.user_attribute_uuid,
                    value: userAttr.value,
                }),
            );

            await Promise.all(promises);

            return inserted.user_attribute_uuid;
        });
        return this.get(attributeUuid);
    }

    async update(
        orgAttributeUuid: string,
        orgAttribute: CreateOrgAttribute,
    ): Promise<OrgAttribute> {
        await this.database(UserAttributesTable);
        // Delete all users,
        // Update the attribute
        // Add all users back in
        return sampleAttribute;
    }

    async delete(orgAttributeUuid: string): Promise<void> {
        await this.database(UserAttributesTable)
            .where('user_attribute_uuid', orgAttributeUuid)
            .delete();
    }
}
