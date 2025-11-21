import {
    findExploresRankingMetadataSchema,
    findFieldsRankingMetadataSchema,
    type ToolFindExploresOutput,
    type ToolFindFieldsOutput,
} from '@lightdash/common';
import { Box, Stack, Text } from '@mantine-8/core';
import { RankingTable, TableCellText } from './RankingTable';

type FieldResult = {
    label: string;
    name: string;
    tableName: string;
    fieldType: string;
    searchRank?: number | null | undefined;
    chartUsage?: number | null | undefined;
};

type ExploreResult = {
    label: string;
    name: string;
    searchRank?: number | null | undefined;
    joinedTables?: string[] | null;
};

export const RankingDisplay: React.FC<{
    ranking:
        | ToolFindFieldsOutput['metadata']['ranking']
        | ToolFindExploresOutput['metadata']['ranking'];
    type: 'findFields' | 'findExplores';
}> = ({ ranking, type }) => {
    if (type === 'findFields') {
        const findFieldsRanking =
            findFieldsRankingMetadataSchema.safeParse(ranking);
        if (!findFieldsRanking.success) {
            return null;
        }

        const parsedRanking = findFieldsRanking.data;

        if (!parsedRanking.searchQueries) {
            return null;
        }

        return (
            <Box>
                <Text fw={500} size="xs" c="dark" mb="xs">
                    Ranking Metadata
                </Text>
                <Stack gap="xs">
                    {parsedRanking.searchQueries.map((query, queryIndex) => (
                        <Box key={queryIndex}>
                            <Text fw={500} size="xs" c="dark" mb="xs">
                                Search: "{query.label}"
                            </Text>
                            {query.pagination && (
                                <Text size="xs" c="dimmed" mb="xs">
                                    Page {query.pagination.page} of{' '}
                                    {query.pagination.totalPageCount} (
                                    {query.pagination.totalResults} total
                                    results)
                                </Text>
                            )}
                            <RankingTable<FieldResult>
                                columns={[
                                    {
                                        header: 'Field',
                                        render: (field) => (
                                            <Box>
                                                <TableCellText>
                                                    {field.label}
                                                </TableCellText>
                                                <TableCellText dimmed>
                                                    {field.name}
                                                </TableCellText>
                                            </Box>
                                        ),
                                    },
                                    {
                                        header: 'Table',
                                        render: (field) => (
                                            <TableCellText>
                                                {field.tableName}
                                            </TableCellText>
                                        ),
                                    },
                                    {
                                        header: 'Type',
                                        render: (field) => (
                                            <TableCellText>
                                                {field.fieldType}
                                            </TableCellText>
                                        ),
                                    },
                                    {
                                        header: 'Rank',
                                        render: (field) => (
                                            <TableCellText>
                                                {field.searchRank !== null &&
                                                field.searchRank !== undefined
                                                    ? field.searchRank.toFixed(
                                                          3,
                                                      )
                                                    : 'N/A'}
                                            </TableCellText>
                                        ),
                                    },
                                    {
                                        header: 'Usage',
                                        render: (field) => (
                                            <TableCellText>
                                                {field.chartUsage ?? 'N/A'}
                                            </TableCellText>
                                        ),
                                    },
                                ]}
                                data={query.results}
                                maxHeight={300}
                            />
                        </Box>
                    ))}
                </Stack>
            </Box>
        );
    }

    if (type === 'findExplores') {
        const findExploresRanking =
            findExploresRankingMetadataSchema.safeParse(ranking);
        if (!findExploresRanking.success) {
            return null;
        }

        const parsedRanking = findExploresRanking.data;

        if (!parsedRanking.searchQuery) {
            return null;
        }

        return (
            <Box>
                <Text fw={500} size="xs" c="dark" mb="xs">
                    Ranking Metadata
                </Text>
                <Stack gap="md">
                    <Text size="xs" c="dimmed">
                        Search Query: "{parsedRanking.searchQuery}"
                    </Text>

                    {parsedRanking.exploreSearchResults &&
                        parsedRanking.exploreSearchResults.length > 0 && (
                            <Box>
                                <Text fw={500} size="xs" c="dark" mb="xs">
                                    Explore Results (
                                    {parsedRanking.exploreSearchResults.length})
                                </Text>
                                <RankingTable<ExploreResult>
                                    columns={[
                                        {
                                            header: 'Explore',
                                            render: (explore) => (
                                                <Box>
                                                    <TableCellText>
                                                        {explore.label}
                                                    </TableCellText>
                                                    <TableCellText dimmed>
                                                        {explore.name}
                                                    </TableCellText>
                                                </Box>
                                            ),
                                        },
                                        {
                                            header: 'Rank',
                                            render: (explore) => (
                                                <TableCellText>
                                                    {explore.searchRank !==
                                                        null &&
                                                    explore.searchRank !==
                                                        undefined
                                                        ? explore.searchRank.toFixed(
                                                              3,
                                                          )
                                                        : 'N/A'}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: 'Joined Tables',
                                            render: (explore) => (
                                                <TableCellText>
                                                    {explore.joinedTables &&
                                                    explore.joinedTables
                                                        .length > 0
                                                        ? explore.joinedTables.join(
                                                              ', ',
                                                          )
                                                        : 'None'}
                                                </TableCellText>
                                            ),
                                        },
                                    ]}
                                    data={parsedRanking.exploreSearchResults}
                                    maxHeight={200}
                                />
                            </Box>
                        )}

                    {parsedRanking.topMatchingFields &&
                        parsedRanking.topMatchingFields.length > 0 && (
                            <Box>
                                <Text fw={500} size="xs" c="dark" mb="xs">
                                    Top Matching Fields (
                                    {parsedRanking.topMatchingFields.length})
                                </Text>
                                <RankingTable<FieldResult>
                                    columns={[
                                        {
                                            header: 'Field',
                                            render: (field) => (
                                                <Box>
                                                    <TableCellText>
                                                        {field.label}
                                                    </TableCellText>
                                                    <TableCellText dimmed>
                                                        {field.name}
                                                    </TableCellText>
                                                </Box>
                                            ),
                                        },
                                        {
                                            header: 'Explore',
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.tableName}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: 'Type',
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.fieldType}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: 'Rank',
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.searchRank !==
                                                        null &&
                                                    field.searchRank !==
                                                        undefined
                                                        ? field.searchRank.toFixed(
                                                              3,
                                                          )
                                                        : 'N/A'}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: 'Usage',
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.chartUsage ?? 'N/A'}
                                                </TableCellText>
                                            ),
                                        },
                                    ]}
                                    data={parsedRanking.topMatchingFields}
                                    maxHeight={300}
                                />
                            </Box>
                        )}
                </Stack>
            </Box>
        );
    }

    return null;
};
