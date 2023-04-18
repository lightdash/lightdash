import {
    PinnedCharts,
    PinnedDashboards,
    PinnedSpaces,
} from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';

type Dependencies = {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;
};

export class PinningService {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;

    constructor({
        dashboardModel,
        savedChartModel,
        spaceModel,
        pinnedListModel,
    }: Dependencies) {
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.pinnedListModel = pinnedListModel;
    }

    // eslint-disable-next-line class-methods-use-this
    async getPinnedDashboards(
        pinnedListUuid: string,
    ): Promise<PinnedDashboards> {
        // const pinnedDashboards = await this.dashboardModel.getPinnedDashboards(pinnedListUuid);
        return [] as PinnedDashboards;
    }

    // eslint-disable-next-line class-methods-use-this
    async getPinnedCharts(pinnedListUuid: string): Promise<PinnedCharts> {
        // const pinnedCharts = await this.savedChartModel.getPinnedCharts(pinnedListUuid);
        return [] as PinnedCharts;
    }

    // eslint-disable-next-line class-methods-use-this
    async getPinnedSpaces(pinnedListUuid: string): Promise<PinnedSpaces> {
        // const pinnedSpaces = await this.spaceModel.getPinnedSpaces(pinnedListUuid);
        return [] as PinnedSpaces;
    }
}
