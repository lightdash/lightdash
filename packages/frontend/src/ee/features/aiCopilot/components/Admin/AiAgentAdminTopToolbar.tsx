import {
    Box,
    Button,
    Divider,
    Group,
    Text,
    useMantineTheme,
    type GroupProps,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import AgentsFilter from './AgentsFilter';
import { FeedbackFilter } from './FeedbackFilter';
import ProjectsFilter from './ProjectsFilter';
import { SearchFilter } from './SearchFilter';
import { SourceFilter } from './SourceFilter';

type AiAgentAdminTopToolbarProps = GroupProps &
    Pick<
        ReturnType<typeof useAiAgentAdminFilters>,
        | 'search'
        | 'selectedProjectUuids'
        | 'selectedAgentUuids'
        | 'selectedSource'
        | 'selectedFeedback'
        | 'setSearch'
        | 'setSelectedProjectUuids'
        | 'setSelectedAgentUuids'
        | 'setSelectedSource'
        | 'setSelectedFeedback'
    > & {
        totalResults: number;
        isFetching: boolean;
        hasNextPage: boolean;
        currentResultsCount: number;
        hasActiveFilters?: boolean;
        onClearFilters?: () => void;
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
        hasActiveFilters,
        onClearFilters,
        ...props
    }) => {
        const theme = useMantineTheme();

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
                            placeholder="Search threads by title"
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
                            selectedProjectUuids={selectedProjectUuids}
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

                        {hasActiveFilters && onClearFilters && (
                            <>
                                <Divider
                                    orientation="vertical"
                                    w={1}
                                    h={20}
                                    style={{
                                        alignSelf: 'center',
                                    }}
                                />
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconTrash}
                                            size="sm"
                                        />
                                    }
                                    onClick={onClearFilters}
                                >
                                    Clear all filters
                                </Button>
                            </>
                        )}
                    </Group>

                    {/* Results count */}
                    <Group gap="xs">
                        <Box
                            bg="ldGray.1"
                            c="ldGray.9"
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
                <Divider color="ldGray.2" />
            </Box>
        );
    },
);

AiAgentAdminTopToolbar.displayName = 'AiAgentAdminTopToolbar';
