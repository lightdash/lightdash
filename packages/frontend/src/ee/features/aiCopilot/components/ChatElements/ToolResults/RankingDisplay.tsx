import {
    findExploresRankingMetadataSchema,
    findFieldsRankingMetadataSchema,
    type ToolFindExploresOutput,
    type ToolFindFieldsOutput,
} from '@lightdash/common';
import { Box, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiCopilotChat');
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
                    {t('ranking.title')}
                </Text>
                <Stack gap="xs">
                    {parsedRanking.searchQueries.map((query, queryIndex) => (
                        <Box key={queryIndex}>
                            <Text fw={500} size="xs" c="dark" mb="xs">
                                {t('ranking.search', { query: query.label })}
                            </Text>
                            {query.status === 'error' ? (
                                <Text size="xs" c="red" mb="xs">
                                    {query.error}
                                </Text>
                            ) : (
                                <>
                                    {query.pagination && (
                                        <Text size="xs" c="dimmed" mb="xs">
                                            {t('ranking.pagination', {
                                                page: query.pagination.page,
                                                totalPages:
                                                    query.pagination
                                                        .totalPageCount,
                                                totalResults:
                                                    query.pagination
                                                        .totalResults,
                                            })}
                                        </Text>
                                    )}
                                    <RankingTable<FieldResult>
                                        columns={[
                                            {
                                                header: t(
                                                    'ranking.columns.field',
                                                ),
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
                                                header: t(
                                                    'ranking.columns.table',
                                                ),
                                                render: (field) => (
                                                    <TableCellText>
                                                        {field.tableName}
                                                    </TableCellText>
                                                ),
                                            },
                                            {
                                                header: t(
                                                    'ranking.columns.type',
                                                ),
                                                render: (field) => (
                                                    <TableCellText>
                                                        {field.fieldType}
                                                    </TableCellText>
                                                ),
                                            },
                                            {
                                                header: t(
                                                    'ranking.columns.rank',
                                                ),
                                                render: (field) => (
                                                    <TableCellText>
                                                        {field.searchRank !==
                                                            null &&
                                                        field.searchRank !==
                                                            undefined
                                                            ? field.searchRank.toFixed(
                                                                  3,
                                                              )
                                                            : t(
                                                                  'ranking.notAvailable',
                                                              )}
                                                    </TableCellText>
                                                ),
                                            },
                                            {
                                                header: t(
                                                    'ranking.columns.usage',
                                                ),
                                                render: (field) => (
                                                    <TableCellText>
                                                        {field.chartUsage ??
                                                            t(
                                                                'ranking.notAvailable',
                                                            )}
                                                    </TableCellText>
                                                ),
                                            },
                                        ]}
                                        data={query.results}
                                        maxHeight={300}
                                    />
                                </>
                            )}
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
                    {t('ranking.title')}
                </Text>
                <Stack gap="md">
                    <Text size="xs" c="dimmed">
                        {t('ranking.searchQuery', {
                            query: parsedRanking.searchQuery,
                        })}
                    </Text>

                    {parsedRanking.exploreSearchResults &&
                        parsedRanking.exploreSearchResults.length > 0 && (
                            <Box>
                                <Text fw={500} size="xs" c="dark" mb="xs">
                                    {t('ranking.exploreResults', {
                                        count: parsedRanking
                                            .exploreSearchResults.length,
                                    })}
                                </Text>
                                <RankingTable<ExploreResult>
                                    columns={[
                                        {
                                            header: t(
                                                'ranking.columns.explore',
                                            ),
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
                                            header: t('ranking.columns.rank'),
                                            render: (explore) => (
                                                <TableCellText>
                                                    {explore.searchRank !==
                                                        null &&
                                                    explore.searchRank !==
                                                        undefined
                                                        ? explore.searchRank.toFixed(
                                                              3,
                                                          )
                                                        : t(
                                                              'ranking.notAvailable',
                                                          )}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: t(
                                                'ranking.columns.joinedTables',
                                            ),
                                            render: (explore) => (
                                                <TableCellText>
                                                    {explore.joinedTables &&
                                                    explore.joinedTables
                                                        .length > 0
                                                        ? explore.joinedTables.join(
                                                              ', ',
                                                          )
                                                        : t('ranking.none')}
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
                                    {t('ranking.topMatchingFields', {
                                        count: parsedRanking.topMatchingFields
                                            .length,
                                    })}
                                </Text>
                                <RankingTable<FieldResult>
                                    columns={[
                                        {
                                            header: t('ranking.columns.field'),
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
                                            header: t(
                                                'ranking.columns.explore',
                                            ),
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.tableName}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: t('ranking.columns.type'),
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.fieldType}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: t('ranking.columns.rank'),
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.searchRank !==
                                                        null &&
                                                    field.searchRank !==
                                                        undefined
                                                        ? field.searchRank.toFixed(
                                                              3,
                                                          )
                                                        : t(
                                                              'ranking.notAvailable',
                                                          )}
                                                </TableCellText>
                                            ),
                                        },
                                        {
                                            header: t('ranking.columns.usage'),
                                            render: (field) => (
                                                <TableCellText>
                                                    {field.chartUsage ??
                                                        t(
                                                            'ranking.notAvailable',
                                                        )}
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
