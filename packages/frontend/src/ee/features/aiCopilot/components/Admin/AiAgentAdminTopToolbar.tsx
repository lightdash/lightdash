import {
    Box,
    Divider,
    Group,
    Text,
    useMantineTheme,
    type GroupProps,
} from '@mantine-8/core';
import { memo, useCallback, type FC } from 'react';
import AgentsFilter from './AgentsFilter';
import { FeedbackFilter } from './FeedbackFilter';
import ProjectsFilter from './ProjectsFilter';
import { SearchFilter } from './SearchFilter';
import { SourceFilter } from './SourceFilter';

type AiAgentAdminTopToolbarProps = GroupProps & {
    search: string | undefined;
    setSearch: (search: string) => void;
    selectedProjectUuids: string[];
    setSelectedProjectUuids: (projectUuids: string[]) => void;
    selectedAgentUuids: string[];
    setSelectedAgentUuids: (agentUuids: string[]) => void;
    selectedSource: 'all' | 'web_app' | 'slack';
    setSelectedSource: (source: 'all' | 'web_app' | 'slack') => void;
    selectedFeedback: 'all' | 'thumbs_up' | 'thumbs_down';
    setSelectedFeedback: (
        feedback: 'all' | 'thumbs_up' | 'thumbs_down',
    ) => void;
    totalResults: number;
    isFetching: boolean;
    hasNextPage: boolean;
    currentResultsCount: number;
};

export const AiAgentAdminTopToolbar: FC<AiAgentAdminTopToolbarProps> = memo(
    ({
        search,
        setSearch,
        selectedProjectUuids,
        setSelectedProjectUuids,
        selectedAgentUuids,
        setSelectedAgentUuids,
        selectedSource,
        setSelectedSource,
        selectedFeedback,
        setSelectedFeedback,
        totalResults,
        isFetching,
        hasNextPage,
        currentResultsCount,
        ...props
    }) => {
        const theme = useMantineTheme();
        const clearSearch = useCallback(() => setSearch(''), [setSearch]);

        return (
            <Box>
                <Group
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    justify="space-between"
                    {...props}
                >
                    <Group gap="xs">
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            clearSearch={clearSearch}
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{
                                alignSelf: 'center',
                            }}
                        />
                        <ProjectsFilter
                            selectedProjectUuids={selectedProjectUuids}
                            setSelectedProjectUuids={setSelectedProjectUuids}
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{
                                alignSelf: 'center',
                            }}
                        />
                        <AgentsFilter
                            selectedAgentUuids={selectedAgentUuids}
                            setSelectedAgentUuids={setSelectedAgentUuids}
                        />
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{
                                alignSelf: 'center',
                            }}
                        />
                        <FeedbackFilter
                            selectedFeedback={selectedFeedback}
                            setSelectedFeedback={setSelectedFeedback}
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{
                                alignSelf: 'center',
                            }}
                        />
                        <SourceFilter
                            selectedSource={selectedSource}
                            setSelectedSource={setSelectedSource}
                        />
                    </Group>

                    {/* Results count */}
                    <Group gap="xs">
                        <Box
                            bg="#F8F9FC"
                            c="#363F72"
                            style={{
                                borderRadius: 6,
                                padding: `${theme.spacing.sm} ${theme.spacing.xs}`,
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <Text fz="sm" fw={500}>
                                {isFetching
                                    ? 'Loading...'
                                    : hasNextPage
                                    ? `${currentResultsCount} of ${totalResults} threads`
                                    : `${totalResults} threads`}
                            </Text>
                        </Box>
                    </Group>
                </Group>
                <Divider color="gray.2" />
            </Box>
        );
    },
);

AiAgentAdminTopToolbar.displayName = 'AiAgentAdminTopToolbar';
