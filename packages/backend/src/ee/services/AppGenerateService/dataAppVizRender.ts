import {
    isAppVersionInProgress,
    NotFoundError,
    ParameterError,
    type DataAppVizRenderMetadata,
} from '@lightdash/common';
import { type DbAppVersion } from '../../../database/entities/apps';
import { type AppModel } from '../../../models/AppModel';
import { type BundleServableChecker } from './appBundleStorage';

export type DataAppVisualizationForRender = NonNullable<
    Awaited<ReturnType<AppModel['findVisualizationApp']>>
>;

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

export const resolveDataAppVizRenderMetadata = async (
    appModel: AppModel,
    appUuid: string,
    isBundleServable: BundleServableChecker,
): Promise<DataAppVizRenderMetadata> => {
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

export const resolveRenderableDataAppVizVersion = async (
    appModel: AppModel,
    appUuid: string,
    version: number,
): Promise<DbAppVersion> => {
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
    return appVersion;
};
