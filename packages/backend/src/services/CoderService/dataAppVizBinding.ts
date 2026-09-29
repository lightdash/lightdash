import {
    ChartType,
    NotFoundError,
    ParameterError,
    type ChartAsCodeConfig,
    type ChartConfig,
    type DataAppVizSchema,
} from '@lightdash/common';
import type Logger from '../../logging/logger';
import type { AppModel } from '../../models/AppModel';

export type ResolvedDataAppVizBinding = {
    chartConfig: ChartConfig;
    /** The pinned version's declared schema; absent for built-in chart types. */
    vizSchema?: DataAppVizSchema;
};

/** Where the binding came from, so failures tell the author how to fix them. */
type BindingSource = 'contentAsCode' | 'document';

const HINTS: Record<
    BindingSource,
    {
        missingSlug: (slug: string) => string;
        unrenderableVersion: string;
        foreignUuid: string;
    }
> = {
    contentAsCode: {
        missingSlug: (slug) =>
            ` Upload it first (lightdash upload --chart-types ${slug}), then re-upload this chart.`,
        unrenderableVersion:
            ' Upload a renderable version of this chart type, then re-upload this chart.',
        foreignUuid:
            ' Chart type uuids are project-specific: re-download the chart with a current CLI to get a portable dataAppVizSlug, upload the chart type into this project, then re-upload this chart.',
    },
    document: {
        missingSlug: () =>
            ' Install the chart type in this project, or pick a different chart type.',
        unrenderableVersion:
            ' Omit dataAppVizVersion to use the latest renderable version.',
        foreignUuid:
            ' Chart type uuids are project-specific: reference it by dataAppVizSlug instead.',
    },
};

/**
 * Convert a portable viz binding to the runtime shape: resolve the
 * dataAppVizSlug against the target project's chart types and rewrite the
 * config with the resolved uuid and a pinned, renderable version. A slug
 * missing in the target fails loudly. A legacy dataAppVizUuid — whether it
 * stands alone or backs up a missing slug — is accepted only when it resolves
 * to a chart type in the target project; uuids are project-specific, so
 * keeping a foreign one would create a dangling cross-project reference.
 */
export const resolveDataAppVizBinding = async ({
    appModel,
    logger,
    projectUuid,
    chartConfig,
    source,
}: {
    appModel: Pick<
        AppModel,
        | 'findAppsBySlugs'
        | 'findAppsByUuids'
        | 'getVersion'
        | 'getLatestRenderableDataAppVizVersion'
    >;
    logger: Pick<typeof Logger, 'warn'>;
    projectUuid: string;
    chartConfig: ChartAsCodeConfig;
    source: BindingSource;
}): Promise<ResolvedDataAppVizBinding> => {
    if (chartConfig.type !== ChartType.DATA_APP_VIZ) {
        return { chartConfig };
    }
    if (chartConfig.config === undefined) {
        return {
            chartConfig: { type: ChartType.DATA_APP_VIZ, config: undefined },
        };
    }
    const hints = HINTS[source];
    const { dataAppVizSlug, dataAppVizUuid, dataAppVizVersion, ...configRest } =
        chartConfig.config;
    const withTargetVersion = async (
        targetDataAppVizUuid: string,
    ): Promise<ResolvedDataAppVizBinding> => {
        const targetVersion =
            dataAppVizVersion === undefined
                ? await appModel.getLatestRenderableDataAppVizVersion(
                      targetDataAppVizUuid,
                  )
                : await appModel.getVersion(
                      targetDataAppVizUuid,
                      dataAppVizVersion,
                  );
        if (
            targetVersion === null ||
            targetVersion.status !== 'ready' ||
            targetVersion.viz_schema === null
        ) {
            throw new NotFoundError(
                dataAppVizVersion === undefined
                    ? `Custom chart type ${targetDataAppVizUuid} has no renderable version`
                    : `Custom chart type "${dataAppVizSlug ?? targetDataAppVizUuid}" version ${dataAppVizVersion} is not renderable in this project.${hints.unrenderableVersion}`,
            );
        }
        return {
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    ...configRest,
                    dataAppVizUuid: targetDataAppVizUuid,
                    dataAppVizVersion: targetVersion.version,
                },
            },
            vizSchema: targetVersion.viz_schema,
        };
    };
    // The 'only' filter also rejects uuids pointing at regular data apps.
    const uuidResolvesInTargetProject = async (): Promise<boolean> =>
        dataAppVizUuid !== undefined &&
        (
            await appModel.findAppsByUuids(projectUuid, [dataAppVizUuid], {
                dataAppVizsFilter: 'only',
            })
        ).length > 0;
    if (dataAppVizSlug !== undefined) {
        const [vizRow] = await appModel.findAppsBySlugs(
            projectUuid,
            [dataAppVizSlug],
            { dataAppVizsFilter: 'only' },
        );
        if (vizRow !== undefined) {
            return withTargetVersion(vizRow.app_id);
        }
        // Interim files carry both identities — fall back to the uuid,
        // but only when it names a chart type in this project.
        if (
            dataAppVizUuid !== undefined &&
            (await uuidResolvesInTargetProject())
        ) {
            logger.warn(
                `Chart type "${dataAppVizSlug}" was not found in project ${projectUuid}; keeping the chart's existing dataAppVizUuid reference.`,
            );
            return withTargetVersion(dataAppVizUuid);
        }
        throw new NotFoundError(
            `Custom chart type "${dataAppVizSlug}" was not found in this project.${hints.missingSlug(dataAppVizSlug)}`,
        );
    }
    if (dataAppVizUuid !== undefined) {
        if (await uuidResolvesInTargetProject()) {
            return withTargetVersion(dataAppVizUuid);
        }
        throw new ParameterError(
            `Custom chart type ${dataAppVizUuid} was not found in this project.${hints.foreignUuid}`,
        );
    }
    throw new ParameterError(
        'Chart uses a custom chart type but carries neither dataAppVizSlug nor dataAppVizUuid.',
    );
};
