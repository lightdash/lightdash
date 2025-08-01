import {
    CatalogField,
    CatalogTable,
    FieldType,
    getItemId,
    toolFindExploresArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findExplores: FindExploresFn;
};

const PAGE_SIZE = 15;

const generateExploreResponse = (
    table: CatalogTable,
    fields: CatalogField[],
) => {
    const allTableNames = [table.name, ...(table.joinedTables ?? [])];

    const dimensions = fields
        .filter((field) => field.fieldType === FieldType.DIMENSION)
        .filter((field) => allTableNames.includes(field.tableName))
        .sort((a, b) => (b.chartUsage ?? 0) - (a.chartUsage ?? 0));

    const metrics = fields
        .filter((field) => field.fieldType === FieldType.METRIC)
        .filter((field) => allTableNames.includes(field.tableName))
        .sort((a, b) => (b.chartUsage ?? 0) - (a.chartUsage ?? 0));

    return `
<Explore table="${table.name}">
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
                    `<JoinedTable id="${joinedTable}">${joinedTable}</JoinedTable>`,
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
                    (d) =>
                        `<Dimension fieldId="${getItemId({
                            name: d.name,
                            table: d.tableName,
                        })}" table="${d.tableName}" name="${d.name}" label="${
                            d.label
                        }" />`,
                )
                .join('\n')}
        </Dimensions>

        <Metrics alt="metric ids sorted by popularity" size="${metrics.length}">
            ${metrics
                .map(
                    (m) =>
                        `<Metric fieldId="${getItemId({
                            name: m.name,
                            table: m.tableName,
                        })}" table="${m.tableName}" name="${m.name}" label="${
                            m.label
                        }" />`,
                )
                .join('\n')}
        </Metrics>
    </Fields>
</Explore>`.trim();
};

export const getFindExplores = ({ findExplores }: Dependencies) => {
    const schema = toolFindExploresArgsSchema;

    return tool({
        description: `Tool: "findExplores"

Purpose:
Lists available Explores along with their field labels, joined tables, descriptions, and a partial list of dimensions and metrics.

Usage tips:
- Use this to understand Explore structure before calling "findFields".
- Only shows a subset of fields — use "findFields" for full field details.
- Results are paginated — use the next page token to get more.`,
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
