import {
    getLtreePathFromSlug,
    NotFoundError,
    type UUID,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DashboardsTableName } from '../database/entities/dashboards';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import {
    SpaceTableName,
    type CreateDbSpace,
    type DbSpace,
} from '../database/entities/spaces';

const LogicalSpaceTableName = 'logical_space';

export type DashboardAccessContainer = {
    dashboardUuid: UUID;
    spaceUuid: UUID;
    projectUuid: UUID;
    organizationUuid: UUID;
};

type DashboardLocation = {
    dashboardUuid: UUID;
    projectId: number;
    projectUuid: UUID;
    organizationUuid: UUID;
};

type CreateDashboardAccessContainer = CreateDbSpace &
    Pick<DbSpace, 'is_access_container' | 'access_container_dashboard_uuid'>;

export class DashboardAccessContainerModel {
    constructor(private readonly database: Knex) {}

    async getByDashboardUuids(
        dashboardUuids: UUID[],
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<Record<UUID, DashboardAccessContainer>> {
        if (dashboardUuids.length === 0) {
            return {};
        }

        const rows = await trx(SpaceTableName)
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SpaceTableName}.access_container_dashboard_uuid`,
            )
            .innerJoin(
                `${SpaceTableName} as ${LogicalSpaceTableName}`,
                function joinLogicalSpace() {
                    this.on(
                        `${LogicalSpaceTableName}.space_id`,
                        `${DashboardsTableName}.space_id`,
                    ).andOn(
                        `${LogicalSpaceTableName}.project_id`,
                        `${SpaceTableName}.project_id`,
                    );
                },
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .whereIn(
                `${SpaceTableName}.access_container_dashboard_uuid`,
                dashboardUuids,
            )
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(`${SpaceTableName}.is_access_container`, true)
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .whereNull(`${LogicalSpaceTableName}.deleted_at`)
            .where(`${LogicalSpaceTableName}.is_access_container`, false)
            .select<DashboardAccessContainer[]>({
                dashboardUuid: `${SpaceTableName}.access_container_dashboard_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
            });

        return Object.fromEntries(rows.map((row) => [row.dashboardUuid, row]));
    }

    async getOrCreate(
        dashboardUuid: UUID,
        createdByUserId: number,
        { trx }: { trx?: Knex.Transaction } = {},
    ): Promise<DashboardAccessContainer> {
        const create = async (transaction: Knex.Transaction) => {
            const dashboard = await transaction(DashboardsTableName)
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${DashboardsTableName}.space_id`,
                )
                .innerJoin(
                    ProjectTableName,
                    `${ProjectTableName}.project_id`,
                    `${SpaceTableName}.project_id`,
                )
                .innerJoin(
                    OrganizationTableName,
                    `${OrganizationTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                )
                .where(`${DashboardsTableName}.dashboard_uuid`, dashboardUuid)
                .whereNull(`${DashboardsTableName}.deleted_at`)
                .whereNull(`${SpaceTableName}.deleted_at`)
                .where(`${SpaceTableName}.is_access_container`, false)
                .select<DashboardLocation>({
                    dashboardUuid: `${DashboardsTableName}.dashboard_uuid`,
                    projectId: `${ProjectTableName}.project_id`,
                    projectUuid: `${ProjectTableName}.project_uuid`,
                    organizationUuid: `${OrganizationTableName}.organization_uuid`,
                })
                .first()
                .forUpdate(DashboardsTableName);

            if (dashboard === undefined) {
                throw new NotFoundError('Dashboard not found');
            }

            const existing = await this.getByDashboardUuids([dashboardUuid], {
                trx: transaction,
            });
            if (existing[dashboardUuid] !== undefined) {
                return existing[dashboardUuid];
            }

            const key = uuidv4();
            const slug = `access-container-${key}`;
            const accessContainer: CreateDashboardAccessContainer = {
                project_id: dashboard.projectId,
                name: 'Dashboard access container',
                created_by_user_id: createdByUserId,
                slug,
                parent_space_uuid: null,
                path: getLtreePathFromSlug(slug),
                inherit_parent_permissions: false,
                is_default_user_space: false,
                is_access_container: true,
                access_container_dashboard_uuid: dashboardUuid,
            };
            const [space] = await transaction(SpaceTableName)
                .insert(accessContainer)
                .returning<{ space_uuid: UUID }[]>('space_uuid');

            if (space === undefined) {
                throw new Error('Failed to create dashboard access container');
            }

            return {
                dashboardUuid,
                spaceUuid: space.space_uuid,
                projectUuid: dashboard.projectUuid,
                organizationUuid: dashboard.organizationUuid,
            };
        };

        if (trx !== undefined) {
            return create(trx);
        }
        return this.database.transaction(create);
    }
}
