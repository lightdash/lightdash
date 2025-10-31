import { AnonymousAccount, ForbiddenError, OssEmbed } from '@lightdash/common';
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
        const { contentId, contentType } = account.access;

        if (!embed.projectUuid) {
            throw new ForbiddenError(
                'Project UUID is required to check embed permissions',
            );
        }

        // Check if the JWT is for a dashboard embed (chart inside dashboard)
        if (contentType === 'dashboard' && contentId) {
            return this.checkEmbeddedDashboardPermission(
                contentId,
                savedChartUuid,
                embed,
            );
        }

        // Otherwise, check if the chart itself is embedded
        return PermissionsService.checkEmbeddedChartPermissions(
            savedChartUuid,
            embed,
        );
    }
}
