import { getItemId, toolFindExploresArgsSchema } from '@lightdash/common';
import { tool } from 'ai';
import { truncate } from 'lodash';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    pageSize: number;
    fieldSearchSize: number;
    fieldOverviewSearchSize: number;
    maxDescriptionLength: number;
    findExplores: FindExploresFn;
};

const generateExploreResponse = ({
    table,
    dimensions,
    metrics,
    dimensionsPagination,
    metricsPagination,
    shouldTruncate,
    maxDescriptionLength,
}: Awaited<ReturnType<FindExploresFn>>['tablesWithFields'][number] & {
    shouldTruncate: boolean;
    maxDescriptionLength: number;
}) =>
    `
<Explore tableName="${table.name}">
    <Label>${table.label}</Label>
    <BaseTable alt="ID of the base table">${table.name}</BaseTable>

    ${
        table.aiHints && table.aiHints.length > 0
            ? `
    <AIHints>
        ${table.aiHints
            .map((hint) => `<Hint>${hint}</Hint>`)
            .join('\n        ')}
    </AIHints>`.trim()
            : ''
    }

    <Description alt="Description of the base table">
        ${
            shouldTruncate
                ? truncate(table.description, {
                      length: maxDescriptionLength,
                      omission: '...(truncated)',
                  })
                : table.description
        }
    </Description>

    ${
        table.joinedTables && table.joinedTables.length > 0
            ? `
    <JoinedTables alt="IDs of the joined tables" totalCount="${
        table.joinedTables.length
    }">
        ${table.joinedTables
            .map((joinedTable) => `<Table>${joinedTable}</Table>`)
            .join('\n        ')}
    </JoinedTables>
`.trim()
            : ''
    }

    <Fields alt="All fields from all tables" totalCount="${
        (dimensionsPagination?.totalResults ?? 0) +
        (metricsPagination?.totalResults ?? 0)
    }" displayedResults="${dimensions.length + metrics.length}">
        <Dimensions alt="most popular dimensions" totalResults="${
            dimensionsPagination?.totalResults ?? 0
        }" displayedResults="${dimensions.length}">
            ${dimensions
                .map(
                    (d) =>
                        `<Dimension table="${d.tableName}" name="${
                            d.name
                        }" fieldId="${getItemId({
                            name: d.name,
                            table: d.tableName,
                        })}">${d.label}</Dimension>`,
                )
                .join('\n            ')}
        </Dimensions>

        <Metrics alt="most popular metrics" totalResults="${
            metricsPagination?.totalResults ?? 0
        }" displayedResults="${metrics.length}">
            ${metrics
                .map(
                    (m) =>
                        `<Metric table="${m.tableName}" name="${
                            m.name
                        }" fieldId="${getItemId({
                            name: m.name,
                            table: m.tableName,
                        })}">${m.label}</Metric>`,
                )
                .join('\n            ')}
        </Metrics>
    </Fields>
</Explore>`.trim();

export const getFindExplores = ({
    findExplores,
    pageSize,
    maxDescriptionLength,
    fieldSearchSize,
    fieldOverviewSearchSize,
}: Dependencies) => {
    const schema = toolFindExploresArgsSchema;

    return tool({
        description: `Tool: findExplores

Purpose:
Lists available Explores along with their field labels, joined tables, hints for you (Ai Hints), descriptions, and a sample set of dimensions and metrics.

Usage Tips:
- Use this to understand the structure of an Explore before calling findFields.
- Only a subset of fields is returned
- Results are paginated — use the next page token to retrieve additional pages.
- It's advised to look for tables first and then use the exploreName parameter to narrow results to a specific Explore.
- When using the exploreName parameter, all fields and full description are returned for that explore.
`,
        parameters: schema,
        execute: async (args) => {
            try {
                if (args.page && args.page < 1) {
                    return `Error: Page must be greater than 0.`;
                }

                const { pagination, tablesWithFields } = await findExplores({
                    tableName: args.exploreName,
                    page: args.page ?? 1,
                    pageSize,
                    fieldSearchSize,
                    fieldOverviewSearchSize,
                });

                const exploreResponses = tablesWithFields
                    .map((tableWithFields) =>
                        generateExploreResponse({
                            ...tableWithFields,
                            shouldTruncate: !args.exploreName,
                            maxDescriptionLength,
                        }),
                    )
                    .join('\n\n');

                if (args.exploreName) {
                    return exploreResponses;
                }

                return `<Explores page="${pagination?.page}" pageSize="${pagination?.pageSize}" totalPageCount="${pagination?.totalPageCount}" totalResults="${pagination?.totalResults}">

${exploreResponses}

</Explores>`;
            } catch (error) {
                return toolErrorHandler(error, `Error listing explores.`);
            }
        },
    });
};
