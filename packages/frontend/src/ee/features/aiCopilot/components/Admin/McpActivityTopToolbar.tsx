import {
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Text,
    useMantineTheme,
    type GroupProps,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useMcpActivityFilters } from '../../hooks/useMcpActivityFilters';
import AgentsFilter from './AgentsFilter';
import ProjectsFilter from './ProjectsFilter';

type McpActivityTopToolbarProps = GroupProps &
    Pick<
        ReturnType<typeof useMcpActivityFilters>,
        | 'selectedProjectUuids'
        | 'selectedAgentUuids'
        | 'selectedStatus'
        | 'setSelectedProjectUuids'
        | 'setSelectedAgentUuids'
        | 'setSelectedStatus'
    > & {
        totalResults: number;
        isFetching: boolean;
        hasNextPage: boolean;
        currentResultsCount: number;
        hasActiveFilters?: boolean;
        onClearFilters?: () => void;
    };

export const McpActivityTopToolbar: FC<McpActivityTopToolbarProps> = memo(
    ({
        selectedProjectUuids,
        setSelectedProjectUuids,
        selectedAgentUuids,
        setSelectedAgentUuids,
        selectedStatus,
        setSelectedStatus,
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
                        <ProjectsFilter
                            selectedProjectUuids={selectedProjectUuids}
                            setSelectedProjectUuids={setSelectedProjectUuids}
                        />
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{ alignSelf: 'center' }}
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
                            style={{ alignSelf: 'center' }}
                        />
                        <SegmentedControl
                            size="xs"
                            radius="md"
                            value={selectedStatus}
                            onChange={(value) =>
                                setSelectedStatus(
                                    value as 'all' | 'success' | 'error',
                                )
                            }
                            data={[
                                { label: 'All', value: 'all' },
                                { label: 'Success', value: 'success' },
                                { label: 'Errors', value: 'error' },
                            ]}
                        />

                        {hasActiveFilters && onClearFilters && (
                            <>
                                <Divider
                                    orientation="vertical"
                                    w={1}
                                    h={20}
                                    style={{ alignSelf: 'center' }}
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
                                      ? `${currentResultsCount} of ${totalResults} tool calls`
                                      : `${totalResults} tool calls`}
                            </Text>
                        </Box>
                    </Group>
                </Group>
                <Divider color="ldGray.2" />
            </Box>
        );
    },
);

McpActivityTopToolbar.displayName = 'McpActivityTopToolbar';
