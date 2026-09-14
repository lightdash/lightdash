import {
    ChartType,
    ForbiddenError,
    isAppVersionInProgress,
    NotFoundError,
    ParameterError,
    type ChartConfig,
    type DataAppVizRenderMetadata,
} from '@lightdash/common';
import { type DbAppVersion } from '../../../database/entities/apps';
import { type AppModel } from '../../../models/AppModel';
import { type BundleServableChecker } from './appBundleStorage';

export type DataAppVisualizationForRender = NonNullable<
    Awaited<ReturnType<AppModel['findVisualizationApp']>>
>;

export type DataAppVizRenderModel = Pick<
    AppModel,
    'getVersion' | 'getLatestVersion' | 'getLatestRenderableDataAppVizVersion'
>;

export const getDataAppVizVersionPin = (
    chartConfig: ChartConfig,
): number | undefined =>
    chartConfig.type === ChartType.DATA_APP_VIZ
        ? chartConfig.config?.dataAppVizVersion
        : undefined;

export const resolveDataAppVisualizationForRender = async (
    appModel: AppModel,
    projectUuid: string,
    dataAppVizUuid: string,
): Promise<DataAppVisualizationForRender> => {
    const dataAppViz = await appModel.findVisualizationApp(
        dataAppVizUuid,
        projectUuid,
    );
    if (!dataAppViz) {
        throw new NotFoundError('Data app visualization not found');
    }
    return dataAppViz;
};

export async function resolveRenderableDataAppVizVersion(
    appModel: Pick<AppModel, 'getVersion'>,
    appUuid: string,
    version: number,
): Promise<
    DbAppVersion & { viz_schema: NonNullable<DbAppVersion['viz_schema']> }
> {
    if (!Number.isInteger(version) || version < 1) {
        throw new ParameterError('Version must be a positive integer');
    }

    const appVersion = await appModel.getVersion(appUuid, version);
    if (
        appVersion === null ||
        appVersion.status !== 'ready' ||
        appVersion.viz_schema === null
    ) {
        throw new NotFoundError(
            'Renderable data app visualization version not found',
        );
    }
    return { ...appVersion, viz_schema: appVersion.viz_schema };
}

export async function assertDataAppVizPreviewVersionAllowed(
    appModel: Pick<
        AppModel,
        'getVersion' | 'getLatestRenderableDataAppVizVersion'
    >,
    appUuid: string,
    requestedVersion: number,
    pinnedVersion?: number,
): Promise<void> {
    const allowedVersion =
        pinnedVersion ??
        (await appModel.getLatestRenderableDataAppVizVersion(appUuid))?.version;
    if (allowedVersion === undefined) {
        throw new NotFoundError(
            'Renderable data app visualization version not found',
        );
    }
    if (requestedVersion !== allowedVersion) {
        throw new ForbiddenError(
            'Not authorized to access this visualization version',
        );
    }
    await resolveRenderableDataAppVizVersion(
        appModel,
        appUuid,
        requestedVersion,
    );
}

export const resolveDataAppVizRenderMetadata = async (
    appModel: DataAppVizRenderModel,
    appUuid: string,
    isBundleServable: BundleServableChecker,
    pinnedVersion?: number,
): Promise<DataAppVizRenderMetadata> => {
    if (pinnedVersion !== undefined) {
        let appVersion: Awaited<
            ReturnType<typeof resolveRenderableDataAppVizVersion>
        >;
        try {
            appVersion = await resolveRenderableDataAppVizVersion(
                appModel,
                appUuid,
                pinnedVersion,
            );
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof ParameterError
            ) {
                return {
                    state: 'unavailable',
                    latestBuildInProgress: false,
                };
            }
            throw error;
        }

        if (!(await isBundleServable(appUuid, appVersion.version))) {
            return {
                state: 'unavailable',
                latestBuildInProgress: false,
            };
        }

        return {
            state: 'ready',
            version: appVersion.version,
            schema: appVersion.viz_schema,
            latestBuildInProgress: false,
        };
    }

    const [latestVersion, latestRenderableVersion] = await Promise.all([
        appModel.getLatestVersion(appUuid),
        appModel.getLatestRenderableDataAppVizVersion(appUuid),
    ]);
    const latestBuildInProgress =
        latestVersion !== null && isAppVersionInProgress(latestVersion.status);

    const renderableVersion =
        latestRenderableVersion !== null &&
        latestRenderableVersion.viz_schema !== null
            ? latestRenderableVersion
            : null;

    // A `ready` row whose bundle is gone from storage would frame the preview
    // route's raw JSON error, so check storage before promising a render.
    if (
        renderableVersion !== null &&
        renderableVersion.viz_schema !== null &&
        (await isBundleServable(appUuid, renderableVersion.version))
    ) {
        return {
            state: 'ready',
            version: renderableVersion.version,
            schema: renderableVersion.viz_schema,
            latestBuildInProgress,
        };
    }

    if (latestBuildInProgress) {
        return {
            state: 'building',
            latestBuildInProgress: true,
        };
    }

    // A build that succeeded and then lost its bundle is not a build failure,
    // and the two read very differently to whoever is looking at the chart.
    if (renderableVersion !== null) {
        return {
            state: 'unavailable',
            latestBuildInProgress: false,
        };
    }

    return {
        state: 'failed',
        latestBuildInProgress: false,
    };
};
