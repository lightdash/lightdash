import { DATA_APP_CLAUDE_MODELS } from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Text,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconBox,
    IconSparkles,
    IconTrash,
    IconUser,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../components/common/FilterFacet';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjects } from '../../../hooks/useProjects';
import {
    DATA_APP_ACTIVITY_PERIODS,
    type useDataAppActivityFilters,
} from '../hooks/useDataAppActivityFilters';

const PERIOD_LABELS: Record<
    (typeof DATA_APP_ACTIVITY_PERIODS)[number],
    string
> = {
    all: 'All time',
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
};

type DataAppActivityTopToolbarProps = Pick<
    ReturnType<typeof useDataAppActivityFilters>,
    | 'selectedProjectUuids'
    | 'selectedUserUuids'
    | 'selectedModels'
    | 'selectedPeriod'
    | 'setSelectedProjectUuids'
    | 'setSelectedUserUuids'
    | 'setSelectedModels'
    | 'setSelectedPeriod'
    | 'hasActiveFilters'
    | 'resetFilters'
> & {
    totalResults: number;
    currentResultsCount: number;
    isFetching: boolean;
    hasNextPage: boolean;
};

export const DataAppActivityTopToolbar: FC<DataAppActivityTopToolbarProps> = ({
    selectedProjectUuids,
    selectedUserUuids,
    selectedModels,
    selectedPeriod,
    setSelectedProjectUuids,
    setSelectedUserUuids,
    setSelectedModels,
    setSelectedPeriod,
    hasActiveFilters,
    resetFilters,
    totalResults,
    currentResultsCount,
    isFetching,
    hasNextPage,
}) => {
    const theme = useMantineTheme();
    const [projectSearch, setProjectSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');

    const { data: projects, isLoading: isLoadingProjects } = useProjects();
    const { data: users, isLoading: isLoadingUsers } = useOrganizationUsers();

    const projectOptions = useMemo<FilterFacetOption[]>(
        () =>
            projects?.map((project) => ({
                value: project.projectUuid,
                label: project.name,
            })) ?? [],
        [projects],
    );

    const userOptions = useMemo<FilterFacetOption[]>(
        () =>
            users?.map((user) => ({
                value: user.userUuid,
                label:
                    `${user.firstName} ${user.lastName}`.trim() || user.email,
            })) ?? [],
        [users],
    );

    const modelOptions = useMemo<FilterFacetOption[]>(
        () =>
            DATA_APP_CLAUDE_MODELS.map((model) => ({
                value: model,
                label: model,
            })),
        [],
    );

    return (
        <Box>
            <Group
                p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                justify="space-between"
            >
                <Group gap="xs">
                    <FilterFacet
                        label="Projects"
                        icon={IconBox}
                        selected={selectedProjectUuids}
                        onChange={setSelectedProjectUuids}
                        options={projectOptions}
                        loading={isLoadingProjects}
                        tooltipLabel="Filter activity by project"
                        searchValue={projectSearch}
                        onSearchChange={setProjectSearch}
                    />
                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        style={{ alignSelf: 'center' }}
                    />
                    <FilterFacet
                        label="Users"
                        icon={IconUser}
                        selected={selectedUserUuids}
                        onChange={setSelectedUserUuids}
                        options={userOptions}
                        loading={isLoadingUsers}
                        tooltipLabel="Filter activity by who generated it"
                        searchValue={userSearch}
                        onSearchChange={setUserSearch}
                    />
                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        style={{ alignSelf: 'center' }}
                    />
                    <FilterFacet
                        label="Models"
                        icon={IconSparkles}
                        selected={selectedModels}
                        onChange={setSelectedModels}
                        options={modelOptions}
                        tooltipLabel="Filter activity by the model that built it"
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
                        value={selectedPeriod}
                        onChange={(value) =>
                            setSelectedPeriod(
                                value as (typeof DATA_APP_ACTIVITY_PERIODS)[number],
                            )
                        }
                        data={DATA_APP_ACTIVITY_PERIODS.map((period) => ({
                            label: PERIOD_LABELS[period],
                            value: period,
                        }))}
                    />
                    {hasActiveFilters && (
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
                                    <MantineIcon icon={IconTrash} size="sm" />
                                }
                                onClick={resetFilters}
                            >
                                Clear all filters
                            </Button>
                        </>
                    )}
                </Group>

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
                              ? `${currentResultsCount} of ${totalResults} generations`
                              : `${totalResults} ${
                                    totalResults === 1
                                        ? 'generation'
                                        : 'generations'
                                }`}
                    </Text>
                </Box>
            </Group>
            <Divider color="ldGray.2" />
        </Box>
    );
};
