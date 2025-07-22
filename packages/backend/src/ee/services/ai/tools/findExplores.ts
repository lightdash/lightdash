import {
    CatalogField,
    CatalogTable,
    CatalogType,
    getItemId,
} from '@lightdash/common';
import { tool } from 'ai';
import { z } from 'zod';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findExplores: FindExploresFn;
};

const DESCRIPTION_MAX_LENGTH = 300;
const PAGE_SIZE = 15;

const generateExploreResponse = (
    table: CatalogTable,
    fields: CatalogField[],
    descriptionMaxLength: number = DESCRIPTION_MAX_LENGTH,
) => {
    const allTableNames = [
        table.name,
        ...(table.joinedTables?.map((t) => t.table) ?? []),
    ];

    const dimensions = fields
        .filter((field) => field.type === CatalogType.Field)
        .filter((field) => allTableNames.includes(field.tableName))
        .sort((a, b) => (b.chartUsage ?? 0) - (a.chartUsage ?? 0));

    const metrics = fields
        .filter((field) => field.type === CatalogType.Field)
        .filter((field) => allTableNames.includes(field.tableName))
        .sort((a, b) => (b.chartUsage ?? 0) - (a.chartUsage ?? 0));

    return `
<Explore id="${table.name}">
    <Label>${table.label}</Label>
    <BaseTable alt="ID of the base table">${table.name}</BaseTable>

    ${
        table.aiHints && table.aiHints.length > 0
            ? `
    <AI Hints>
        ${table.aiHints.map((hint) => `<Hint>${hint}</Hint>`).join('\n')}
    </AI Hints>`.trim()
            : ''
    }

    <Description alt="Description of the base table">
        ${table.description}
    </Description>

    ${
        table.joinedTables && table.joinedTables.length > 0
            ? `
    <JoinedTables alt="IDs of the joined tables" size="${
        table.joinedTables.length
    }">
        ${table.joinedTables
            .map(
                (joinedTable) =>
                    `<JoinedTable id="${joinedTable.table}">${joinedTable.table}</JoinedTable>`,
            )
            .join('\n\n')}
    </JoinedTables>
`.trim()
            : ''
    }

    <Fields alt="All fields from all tables" size="${
        dimensions.length + metrics.length
    }">
        <Dimensions alt="dimension ids" size="${dimensions.length}">
            ${dimensions
                .map(
                    (f) =>
                        `<Dimension fieldId="${getItemId({
                            name: f.name,
                            table: f.tableName,
                        })}">${f.label}</Dimension>`,
                )
                .join('\n')}
        </Dimensions>

        <Metrics alt="metric ids" size="${metrics.length}">
            ${metrics
                .map(
                    (metric) =>
                        `<Metric fieldId="${getItemId({
                            name: metric.name,
                            table: metric.tableName,
                        })}" popularity="${metric.chartUsage ?? 0}">${
                            metric.label
                        }</Metric>`,
                )
                .join('\n')}
        </Metrics>
    </Fields>
</Explore>`.trim();
};

export const getFindExplores = ({ findExplores }: Dependencies) => {
    const schema = z.object({
        page: z
            .number()
            .nullable()
            .describe(
                'Use this to paginate through the results. Starts at 1 and increments by 1.',
            ),
    });

    return tool({
        description: `Use this tool to list available Explores along with their joined tables, including helpful hints, descriptions, available fields, and metrics that contain popularity information; the list is paginated, and you can retrieve additional results by calling the tool again with the next page token.`,
        parameters: schema,
        execute: async (args) => {
            try {
                if (args.page && args.page < 1) {
                    return `Error: Page must be greater than 0.`;
                }

                const { pagination, fields, tables } = await findExplores({
                    page: args.page ?? 1,
                    pageSize: PAGE_SIZE,
                });

                const exploreResponses = tables
                    .map((table) => generateExploreResponse(table, fields))
                    .join('\n\n');

                return `<Explores page="${pagination?.page}" pageSize="${pagination?.pageSize}" totalPageCount="${pagination?.totalPageCount}" totalResults="${pagination?.totalResults}">
                ${exploreResponses}
</Explores>`;
            } catch (error) {
                return toolErrorHandler(error, `Error listing explores.`);
            }
        },
    });
};
