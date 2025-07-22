import {
    CatalogField,
    CatalogTable,
    CatalogType,
    getItemId,
} from '@lightdash/common';
import { tool } from 'ai';
import { truncate } from 'lodash';
import { z } from 'zod';
import type { GetExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getExplores: GetExploresFn;
};

const DESCRIPTION_MAX_LENGTH = 300;

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
${truncate(table.description, {
    length: descriptionMaxLength,
    omission: '... (truncated, read more by calling get explore tool)',
})}
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
                .join('\n\n')}
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
                .join('\n\n')}
        </Metrics>
    </Fields>
</Explore>`.trim();
};

export const getFindExplores = ({ getExplores }: Dependencies) => {
    const schema = z.object({
        page: z
            .number()
            .nullable()
            .default(1)
            .describe('Use this to paginate through the results.'),
    });

    return tool({
        description: `Use this tool to list available Explores with joined tables with hints, description, and available fields. The list is paginated, you can paginate through the results by recalling the tool with the next page token.`,
        parameters: schema,
        execute: async () => {
            try {
                const { pagination, fields, tables } = await getExplores();

                const exploreResponses = tables
                    .map((table) => generateExploreResponse(table, fields))
                    .join('\n\n');

                return exploreResponses;
            } catch (error) {
                console.error(error);
                return toolErrorHandler(error, `Error listing explores.`);
            }
        },
    });
};
