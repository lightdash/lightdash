import {
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Text,
    useMantineTheme,
    type GroupProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
        const { t } = useTranslation('aiCopilotAdmin');
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
                        <Divider orientation="vertical" w={1} h={20} />
                        <AgentsFilter
                            selectedAgentUuids={selectedAgentUuids}
                            setSelectedAgentUuids={setSelectedAgentUuids}
                            selectedProjectUuids={selectedProjectUuids}
                        />
                        <Divider orientation="vertical" w={1} h={20} />
                        <SegmentedControl
                            size="xs"
                            value={selectedStatus}
                            onChange={(value) =>
                                setSelectedStatus(
                                    value as 'all' | 'success' | 'error',
                                )
                            }
                            data={[
                                {
                                    label: t('mcp.toolbar.all'),
                                    value: 'all',
                                },
                                {
                                    label: t('mcp.toolbar.success'),
                                    value: 'success',
                                },
                                {
                                    label: t('mcp.toolbar.errors'),
                                    value: 'error',
                                },
                            ]}
                        />

                        {hasActiveFilters && onClearFilters && (
                            <>
                                <Divider orientation="vertical" w={1} h={20} />
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
                                    {t('mcp.toolbar.clearAllFilters')}
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
                                    ? t('mcp.toolbar.loading')
                                    : hasNextPage
                                      ? t('mcp.toolbar.countOf', {
                                            current: currentResultsCount,
                                            total: totalResults,
                                        })
                                      : t('mcp.toolbar.count', {
                                            total: totalResults,
                                        })}
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
