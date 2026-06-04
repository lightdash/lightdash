import { subject } from '@casl/ability';
import {
    Account,
    Change,
    ChangeDependency,
    ChangesetWithChangesAndDependencies,
    ForbiddenError,
} from '@lightdash/common';
import { CatalogModel } from '../models/CatalogModel/CatalogModel';
import { ChangesetModel } from '../models/ChangesetModel';
import { DashboardModel } from '../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../models/SavedChartModel';
import { BaseService } from './BaseService';

type ChangesetServiceArguments = {
    changesetModel: ChangesetModel;
    catalogModel: CatalogModel;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
};

export class ChangesetService extends BaseService {
    private readonly changesetModel: ChangesetModel;

    private readonly catalogModel: CatalogModel;

    private readonly projectModel: ProjectModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly dashboardModel: DashboardModel;

    constructor(args: ChangesetServiceArguments) {
        super({ serviceName: 'ChangesetService' });
        this.changesetModel = args.changesetModel;
        this.catalogModel = args.catalogModel;
        this.projectModel = args.projectModel;
        this.savedChartModel = args.savedChartModel;
        this.dashboardModel = args.dashboardModel;
    }

    /**
     * Content that would break if this change is reverted: charts that
     * reference the field the change provides, and dashboards that embed those
     * charts (or filter on the field directly). Only `create` changes add a
     * field, so other change types have no dependencies.
     */
    private async getChangeDependencies(
        projectUuid: string,
        change: Change,
        dashboards: Awaited<
            ReturnType<DashboardModel['findDashboardsForValidation']>
        >,
    ): Promise<ChangeDependency[]> {
        if (change.type !== 'create') {
            return [];
        }

        // The explore keys the field under entityName, but the metric's own
        // name can differ - check both candidate field ids.
        const fieldIds = Array.from(
            new Set([
                `${change.entityTableName}_${change.entityName}`,
                `${change.entityTableName}_${change.payload.value.name}`,
            ]),
        );

        const chartSummaries = (
            await Promise.all(
                fieldIds.map((fieldId) =>
                    this.savedChartModel.getChartSummariesForFieldId(
                        projectUuid,
                        fieldId,
                    ),
                ),
            )
        ).flat();

        const chartDependencies = new Map<string, ChangeDependency>();
        for (const chart of chartSummaries) {
            chartDependencies.set(chart.uuid, {
                type: 'chart',
                id: chart.uuid,
                name: chart.name,
            });
        }
        const chartUuids = new Set(chartDependencies.keys());

        const dashboardDependencies = dashboards
            .filter(
                (dashboard) =>
                    dashboard.chartUuids.some((uuid) => chartUuids.has(uuid)) ||
                    fieldIds.some((fieldId) =>
                        JSON.stringify(dashboard.filters).includes(fieldId),
                    ),
            )
            .map<ChangeDependency>((dashboard) => ({
                type: 'dashboard',
                id: dashboard.dashboardUuid,
                name: dashboard.name,
            }));

        return [...chartDependencies.values(), ...dashboardDependencies];
    }

    async findActiveChangesetWithChangesByProjectUuid(
        account: Account,
        projectUuid: string,
    ): Promise<ChangesetWithChangesAndDependencies | undefined> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    projectUuid,
                    organizationUuid: account.organization.organizationUuid!,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view changesets in this project',
            );
        }

        const changeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                projectUuid,
            );

        if (!changeset) {
            return undefined;
        }

        // Dashboards are only needed to resolve dependencies of `create`
        // changes; skip the lookup entirely otherwise.
        const dashboards = changeset.changes.some(
            (change) => change.type === 'create',
        )
            ? await this.dashboardModel.findDashboardsForValidation(projectUuid)
            : [];

        const changes = await Promise.all(
            changeset.changes.map(async (change) => ({
                ...change,
                dependencies: await this.getChangeDependencies(
                    projectUuid,
                    change,
                    dashboards,
                ),
            })),
        );

        return { ...changeset, changes };
    }

    async getChange(
        account: Account,
        projectUuid: string,
        changeUuid: string,
    ): Promise<Change> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    projectUuid,
                    organizationUuid: account.organization.organizationUuid!,
                    metadata: { changeUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view changes in this project',
            );
        }

        return this.changesetModel.getChange(changeUuid, projectUuid);
    }

    async revertChange(
        account: Account,
        projectUuid: string,
        changeUuid: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    projectUuid,
                    organizationUuid: account.organization.organizationUuid!,
                    metadata: { changeUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to revert changes in this project',
            );
        }

        // Get the full changeset BEFORE deleting the change
        const originalChangeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                projectUuid,
            );

        if (!originalChangeset) {
            return;
        }

        const change = await this.changesetModel.getChange(
            changeUuid,
            projectUuid,
        );

        // Get original explores WITHOUT any changes for revert reconstruction
        const originalExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            originalChangeset.changes.map((c) => c.entityTableName),
            { applyChangeset: false },
        );

        // Delete the change
        await this.changesetModel.revertChange(changeUuid, projectUuid);

        // Update catalog using revert logic
        await this.catalogModel.indexCatalogReverts({
            projectUuid,
            revertedChanges: [change],
            originalChangeset,
            originalExplores,
        });
    }

    async revertAllChanges(
        account: Account,
        projectUuid: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    projectUuid,
                    organizationUuid: account.organization.organizationUuid!,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to revert changes in this project',
            );
        }

        const changeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                projectUuid,
            );

        if (!changeset) {
            return;
        }

        const changeUuids = changeset.changes.map(
            (change) => change.changeUuid,
        );

        // Get original explores WITHOUT any changes for revert reconstruction
        const originalExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            changeset.changes.map((change) => change.entityTableName),
            { applyChangeset: false },
        );

        await this.changesetModel.revertChanges({ changeUuids });

        await this.catalogModel.indexCatalogReverts({
            projectUuid,
            revertedChanges: changeset.changes,
            originalChangeset: changeset,
            originalExplores,
        });
    }
}
