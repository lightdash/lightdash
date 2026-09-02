import {
    Box,
    Button,
    Divider,
    Group,
    Switch,
    Text,
    useMantineTheme,
    type GroupProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import AgentsFilter from './AgentsFilter';
import { FeedbackFilter } from './FeedbackFilter';
import ProjectsFilter from './ProjectsFilter';
import { SearchFilter } from './SearchFilter';
import { SourceFilter } from './SourceFilter';
import UsersFilter from './UsersFilter';

type AiAgentAdminTopToolbarProps = GroupProps &
    Pick<
        ReturnType<typeof useAiAgentAdminFilters>,
        | 'search'
        | 'selectedProjectUuids'
        | 'selectedAgentUuids'
        | 'selectedUserUuids'
        | 'selectedSource'
        | 'selectedFeedback'
        | 'setSearch'
        | 'setSelectedProjectUuids'
        | 'setSelectedAgentUuids'
        | 'setSelectedUserUuids'
        | 'setSelectedSource'
        | 'setSelectedFeedback'
        | 'hidePreviewProjects'
        | 'setHidePreviewProjects'
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
        selectedUserUuids,
        setSelectedUserUuids,
        selectedSource,
        setSelectedSource,
        selectedFeedback,
        setSelectedFeedback,
        hidePreviewProjects,
        setHidePreviewProjects,
        totalResults,
        isFetching,
        hasNextPage,
        currentResultsCount,
        hasActiveFilters,
        onClearFilters,
        ...props
    }) => {
        const theme = useMantineTheme();
        const [searchInputKey, setSearchInputKey] = useState(0);

        const handleClearFilters = useCallback(() => {
            onClearFilters?.();
            setSearchInputKey((key) => key + 1);
        }, [onClearFilters]);

        return (
            <Box>
                <Group
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    justify="space-between"
                    {...props}
                >
                    <Group gap="xs">
                        <SearchFilter
                            key={searchInputKey}
                            search={searchInputKey === 0 ? search : undefined}
                            setSearch={setSearch}
                            placeholder="Search threads by title"
                            debounceMs={300}
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            className="ld-self-center"
                        />
                        <ProjectsFilter
                            selectedProjectUuids={selectedProjectUuids}
                            setSelectedProjectUuids={setSelectedProjectUuids}
                            hidePreviewProjects={hidePreviewProjects}
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            className="ld-self-center"
                        />
                        <AgentsFilter
                            selectedAgentUuids={selectedAgentUuids}
                            setSelectedAgentUuids={setSelectedAgentUuids}
                            selectedProjectUuids={selectedProjectUuids}
                            hidePreviewProjects={hidePreviewProjects}
                        />
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            className="ld-self-center"
                        />
                        <UsersFilter
                            selectedUserUuids={selectedUserUuids}
                            setSelectedUserUuids={setSelectedUserUuids}
                        />
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            className="ld-self-center"
                        />
                        <FeedbackFilter
                            selectedFeedback={selectedFeedback}
                            setSelectedFeedback={setSelectedFeedback}
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            className="ld-self-center"
                        />
                        <SourceFilter
                            selectedSource={selectedSource}
                            setSelectedSource={setSelectedSource}
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            className="ld-self-center"
                        />
                        <Switch
                            size="xs"
                            label="Hide preview projects"
                            checked={hidePreviewProjects}
                            onChange={(event) =>
                                setHidePreviewProjects(
                                    event.currentTarget.checked,
                                )
                            }
                        />

                        {hasActiveFilters && onClearFilters && (
                            <>
                                <Divider
                                    orientation="vertical"
                                    w={1}
                                    h={20}
                                    className="ld-self-center"
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
                                    onClick={handleClearFilters}
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
