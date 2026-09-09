import { CatalogType, FieldType } from '@lightdash/common';
import path from 'path';
import { type CatalogModel } from '../../../models/CatalogModel/CatalogModel';
import { loadPlaygroundContent } from './loadPlaygroundContent';
import { type PlaygroundContent } from './playgroundContentTypes';

/** Saved views of existing YAML relationships, seeded after catalog indexing. */
export const seedPlaygroundMetricsTrees = async ({
    projectUuid,
    userUuid,
    content,
    catalogModel,
}: {
    projectUuid: string;
    userUuid: string;
    content: Pick<PlaygroundContent, 'metricsTrees'>;
    catalogModel: Pick<
        CatalogModel,
        'getCatalogItemByName' | 'getMetricsTrees' | 'createMetricsTree'
    >;
}): Promise<void> => {
    if (!content.metricsTrees?.length) return;
    const existing = await catalogModel.getMetricsTrees(projectUuid);
    await content.metricsTrees.reduce<Promise<void>>(
        async (previous, definition) => {
            await previous;
            if (existing.data.some((tree) => tree.slug === definition.slug))
                return;
            const nodes = await Promise.all(
                definition.nodes.map(async (node) => {
                    const metric = await catalogModel.getCatalogItemByName(
                        projectUuid,
                        node.metricName,
                        node.tableName,
                        CatalogType.Field,
                    );
                    if (!metric || metric.field_type !== FieldType.METRIC) {
                        throw new Error(
                            `Training metrics tree references an unavailable metric: ${node.tableName}.${node.metricName}`,
                        );
                    }
                    return {
                        catalogSearchUuid: metric.catalog_search_uuid,
                        xPosition: node.xPosition,
                        yPosition: node.yPosition,
                    };
                }),
            );
            await catalogModel.createMetricsTree(
                {
                    project_uuid: projectUuid,
                    name: definition.name,
                    slug: definition.slug,
                    description: definition.description,
                    source: 'ui',
                    created_by_user_uuid: userUuid,
                },
                nodes,
                [],
            );
        },
        Promise.resolve(),
    );
};

/** Older shared training projects can be missing newer lessons' sample trees. */
export const seedMissingTrainingCopyMetricsTrees = async (
    args: Omit<Parameters<typeof seedPlaygroundMetricsTrees>[0], 'content'>,
): Promise<void> => {
    const content = await loadPlaygroundContent(
        path.resolve(
            process.env.PLAYGROUND_DATA_DIR ??
                path.join(__dirname, '../../../../assets/playground'),
        ),
    );
    await seedPlaygroundMetricsTrees({ ...args, content });
};
