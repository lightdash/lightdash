import {
    DashboardTileTypes,
    type CreateDashboard,
    type SessionUser,
} from '@lightdash/common';
import { type DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { type SavedChartModel } from '../../../models/SavedChartModel';
import { type SpaceModel } from '../../../models/SpaceModel';
import {
    type PlaygroundContent,
    type PlaygroundDashboardChartTile,
} from './playgroundContentTypes';

type SeedPlaygroundContentArguments = {
    projectUuid: string;
    user: Pick<SessionUser, 'userId' | 'userUuid' | 'firstName' | 'lastName'>;
    content: PlaygroundContent;
    spaceModel: {
        createSpace: (
            ...args: Parameters<SpaceModel['createSpace']>
        ) => Promise<{ uuid: string }>;
    };
    savedChartModel: {
        create: (
            ...args: Parameters<SavedChartModel['create']>
        ) => Promise<{ uuid: string }>;
    };
    dashboardModel: {
        create: (
            ...args: Parameters<DashboardModel['create']>
        ) => Promise<unknown>;
    };
};

const isChartTile = (
    tile: PlaygroundContent['dashboard']['tiles'][number],
): tile is PlaygroundDashboardChartTile =>
    tile.type === DashboardTileTypes.SAVED_CHART;

export const seedPlaygroundContent = async ({
    projectUuid,
    user,
    content,
    spaceModel,
    savedChartModel,
    dashboardModel,
}: SeedPlaygroundContentArguments): Promise<void> => {
    const space = await spaceModel.createSpace(
        {
            name: content.space.name,
            inheritParentPermissions: false,
            parentSpaceUuid: null,
        },
        {
            projectUuid,
            userId: user.userId,
            path: content.space.path,
        },
    );

    const chartUuids = new Map(
        await Promise.all(
            content.charts.map(async ({ key, slug, ...chart }) => {
                const savedChart = await savedChartModel.create(
                    projectUuid,
                    user.userUuid,
                    {
                        ...chart,
                        spaceUuid: space.uuid,
                        slug,
                        forceSlug: true,
                        updatedByUser: {
                            userUuid: user.userUuid,
                            firstName: user.firstName,
                            lastName: user.lastName,
                        },
                    },
                );
                return [key, savedChart.uuid] as const;
            }),
        ),
    );

    const { slug, tiles: bundledTiles, ...dashboard } = content.dashboard;
    const tiles: CreateDashboard['tiles'] = bundledTiles.map((tile) => {
        if (!isChartTile(tile)) return tile;

        const { chartKey, ...properties } = tile.properties;
        const savedChartUuid = chartUuids.get(chartKey);
        if (!savedChartUuid) {
            throw new Error(
                `Playground dashboard references an unavailable chart: ${chartKey}`,
            );
        }
        return {
            ...tile,
            properties: {
                ...properties,
                savedChartUuid,
            },
        };
    });

    await dashboardModel.create(
        space.uuid,
        {
            ...dashboard,
            tiles,
            slug,
            forceSlug: true,
        },
        user,
        projectUuid,
    );
};
