import {
    DOCUMENT_SCHEMA_VERSION,
    NotFoundError,
    parseDocumentContent,
    type DocumentContent,
} from '@lightdash/common';
import path from 'path';
import { type DocumentModel } from '../../../models/DocumentModel';
import { loadPlaygroundContent } from './loadPlaygroundContent';
import {
    type PlaygroundChartDefinition,
    type PlaygroundContent,
    type PlaygroundDocumentDefinition,
} from './playgroundContentTypes';

/**
 * A sample document's content: its markdown, and for each chart block the
 * bundle chart it names, as a chart definition. Parsed like any saved
 * document, so a sample that would not save fails here.
 */
export const getPlaygroundDocumentContent = (
    definition: PlaygroundDocumentDefinition,
    charts: PlaygroundChartDefinition[],
): DocumentContent =>
    parseDocumentContent(DOCUMENT_SCHEMA_VERSION, {
        markdown: definition.markdown,
        charts: Object.fromEntries(
            Object.entries(definition.charts).map(([id, chartKey]) => {
                const chart = charts.find(({ key }) => key === chartKey);
                if (!chart) {
                    throw new Error(
                        `Training document "${definition.slug}" references an unknown chart: ${chartKey}`,
                    );
                }
                const { name, description, tableName, metricQuery } = chart;
                return [
                    id,
                    {
                        source: 'semantic',
                        chart: {
                            name,
                            description,
                            tableName,
                            metricQuery,
                            chartConfig: chart.chartConfig,
                            ...(chart.tableConfig
                                ? { tableConfig: chart.tableConfig }
                                : {}),
                            ...(chart.pivotConfig
                                ? { pivotConfig: chart.pivotConfig }
                                : {}),
                        },
                    },
                ];
            }),
        ),
    });

/**
 * Creates the bundle's sample documents in a project's space, attributed to
 * the given user. A document whose slug the project already has is left
 * alone, so seeding the same project twice adds nothing.
 */
export const seedPlaygroundDocuments = async ({
    projectUuid,
    spaceUuid,
    createdByUserUuid,
    content,
    documentModel,
}: {
    projectUuid: string;
    spaceUuid: string;
    createdByUserUuid: string | null;
    content: Pick<PlaygroundContent, 'charts' | 'documents'>;
    documentModel: Pick<DocumentModel, 'create' | 'getBySlug'>;
}): Promise<void> => {
    if (!content.documents?.length) return;
    const exists = (slug: string) =>
        documentModel.getBySlug(projectUuid, slug).then(
            () => true,
            (error: unknown) => {
                if (error instanceof NotFoundError) return false;
                throw error;
            },
        );
    await content.documents.reduce<Promise<void>>(
        async (previous, definition) => {
            await previous;
            if (await exists(definition.slug)) return;
            await documentModel.create({
                projectUuid,
                spaceUuid,
                name: definition.name,
                slug: definition.slug,
                description: definition.description,
                content: getPlaygroundDocumentContent(
                    definition,
                    content.charts,
                ),
                createdByUserUuid,
            });
        },
        Promise.resolve(),
    );
};

/** A training copy's sample documents, read from the shipped bundle. */
export const seedTrainingCopyDocuments = async (
    args: Omit<Parameters<typeof seedPlaygroundDocuments>[0], 'content'>,
): Promise<void> => {
    const content = await loadPlaygroundContent(
        path.resolve(
            process.env.PLAYGROUND_DATA_DIR ??
                path.join(__dirname, '../../../../assets/playground'),
        ),
    );
    await seedPlaygroundDocuments({ ...args, content });
};
