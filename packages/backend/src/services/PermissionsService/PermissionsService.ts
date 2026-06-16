import {
    AnonymousAccount,
    assertUnreachable,
    ForbiddenError,
    OssEmbed,
} from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { BaseService } from '../BaseService';

type PermissionsServiceArguments = {
    dashboardModel: DashboardModel;
};

export class PermissionsService extends BaseService {
    private readonly dashboardModel: DashboardModel;

    constructor(args: PermissionsServiceArguments) {
        super();
        this.dashboardModel = args.dashboardModel;
    }

    private async checkEmbeddedDashboardPermission(
        dashboardUuid: string,
        savedChartUuid: string,
        embed: OssEmbed,
    ) {
        if (
            !embed.allowAllDashboards &&
            !embed.dashboardUuids.includes(dashboardUuid)
        ) {
            throw new ForbiddenError(
                `Dashboard ${dashboardUuid} is not embedded`,
            );
        }
        const chartExists =
            await this.dashboardModel.savedChartExistsInDashboard(
                embed.projectUuid,
                dashboardUuid,
                savedChartUuid,
            );

        if (!chartExists) {
            throw new ForbiddenError(
                `This chart does not belong to dashboard ${dashboardUuid}`,
            );
        }
    }

    private static checkEmbeddedChartPermissions(
        savedChartUuid: string,
        embed: OssEmbed,
    ) {
        if (
            !embed.allowAllCharts &&
            !embed.chartUuids.includes(savedChartUuid)
        ) {
            throw new ForbiddenError(`Chart ${savedChartUuid} is not embedded`);
        }
    }

    /**
     * Determines if the given account has permission to access the provided chart.
     */
    async checkEmbedPermissions(
        account: AnonymousAccount,
        savedChartUuid: string,
    ) {
        const { embed } = account;
        const { content } = account.access;

        if (!embed.projectUuid) {
            throw new ForbiddenError(
                'Project UUID is required to check embed permissions',
            );
        }

        switch (content.type) {
            case 'dashboard':
                if (!content.dashboardUuid) {
                    throw new ForbiddenError(
                        'Invalid access for embed permissions',
                    );
                }
                return this.checkEmbeddedDashboardPermission(
                    content.dashboardUuid,
                    savedChartUuid,
                    embed,
                );
            case 'chart':
                return PermissionsService.checkEmbeddedChartPermissions(
                    savedChartUuid,
                    embed,
                );
            case 'dataApp':
                throw new ForbiddenError(
                    'Data app embeds cannot access charts',
                );
            case 'aiAgent':
                throw new ForbiddenError(
                    'AI agent embeds cannot access charts',
                );
            default:
                return assertUnreachable(
                    content.type,
                    'Invalid access for embed permissions',
                );
        }
    }

    /**
     * Determines if the given embed account has permission to access the
     * provided SQL chart via its parent dashboard. SQL charts are only
     * embeddable through a dashboard tile, so chart-scoped JWTs are rejected.
     */
    async checkEmbedSqlChartPermissions(
        account: AnonymousAccount,
        savedSqlUuid: string,
    ) {
        const { embed } = account;
        const { content } = account.access;

        if (!embed.projectUuid) {
            throw new ForbiddenError(
                'Project UUID is required to check embed permissions',
            );
        }

        if (content.type !== 'dashboard' || !content.dashboardUuid) {
            throw new ForbiddenError(
                'SQL charts can only be embedded via a dashboard',
            );
        }

        if (
            !embed.allowAllDashboards &&
            !embed.dashboardUuids.includes(content.dashboardUuid)
        ) {
            throw new ForbiddenError(
                `Dashboard ${content.dashboardUuid} is not embedded`,
            );
        }

        const sqlChartExists =
            await this.dashboardModel.savedSqlChartExistsInDashboard(
                embed.projectUuid,
                content.dashboardUuid,
                savedSqlUuid,
            );

        if (!sqlChartExists) {
            throw new ForbiddenError(
                `This SQL chart does not belong to dashboard ${content.dashboardUuid}`,
            );
        }
    }
}
