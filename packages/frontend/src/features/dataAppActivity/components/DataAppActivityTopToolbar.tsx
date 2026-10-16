import {
    DATA_APP_CLAUDE_MODELS,
    DATA_APP_CODEX_MODELS,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    SegmentedControl,
    Text,
    useMantineTheme,
} from '@mantine/core';
import {
    IconBox,
    IconSparkles,
    IconTrash,
    IconUser,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../components/common/FilterFacet';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjects } from '../../../hooks/useProjects';
import {
    DATA_APP_ACTIVITY_KINDS,
    DATA_APP_ACTIVITY_PERIODS,
    type DataAppActivityKind,
    type useDataAppActivityFilters,
} from '../hooks/useDataAppActivityFilters';

type DataAppActivityTopToolbarProps = Pick<
    ReturnType<typeof useDataAppActivityFilters>,
    | 'selectedProjectUuids'
    | 'selectedUserUuids'
    | 'selectedModels'
    | 'selectedPeriod'
    | 'selectedKind'
    | 'setSelectedProjectUuids'
    | 'setSelectedUserUuids'
    | 'setSelectedModels'
    | 'setSelectedPeriod'
    | 'setSelectedKind'
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
    selectedKind,
    setSelectedProjectUuids,
    setSelectedUserUuids,
    setSelectedModels,
    setSelectedPeriod,
    setSelectedKind,
    hasActiveFilters,
    resetFilters,
    totalResults,
    currentResultsCount,
    isFetching,
    hasNextPage,
}) => {
    const { t } = useTranslation('queryHistory');
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
            [...DATA_APP_CLAUDE_MODELS, ...DATA_APP_CODEX_MODELS].map(
                (model) => ({
                    value: model,
                    label: model,
                }),
            ),
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
                        label={t('dataAppActivity.filters.projects')}
                        icon={IconBox}
                        selected={selectedProjectUuids}
                        onChange={setSelectedProjectUuids}
                        options={projectOptions}
                        loading={isLoadingProjects}
                        tooltipLabel={t(
                            'dataAppActivity.filters.projectsTooltip',
                        )}
                        searchValue={projectSearch}
                        onSearchChange={setProjectSearch}
                    />
                    <Divider orientation="vertical" w={1} h={20} />
                    <FilterFacet
                        label={t('dataAppActivity.filters.users')}
                        icon={IconUser}
                        selected={selectedUserUuids}
                        onChange={setSelectedUserUuids}
                        options={userOptions}
                        loading={isLoadingUsers}
                        tooltipLabel={t('dataAppActivity.filters.usersTooltip')}
                        searchValue={userSearch}
                        onSearchChange={setUserSearch}
                    />
                    <Divider orientation="vertical" w={1} h={20} />
                    <FilterFacet
                        label={t('dataAppActivity.filters.models')}
                        icon={IconSparkles}
                        selected={selectedModels}
                        onChange={setSelectedModels}
                        options={modelOptions}
                        tooltipLabel={t(
                            'dataAppActivity.filters.modelsTooltip',
                        )}
                    />
                    <Divider orientation="vertical" w={1} h={20} />
                    <SegmentedControl
                        size="xs"
                        value={selectedPeriod}
                        onChange={(value) =>
                            setSelectedPeriod(
                                value as (typeof DATA_APP_ACTIVITY_PERIODS)[number],
                            )
                        }
                        data={DATA_APP_ACTIVITY_PERIODS.map((period) => ({
                            label: t(`dataAppActivity.periods.${period}`),
                            value: period,
                        }))}
                    />
                    <Divider orientation="vertical" w={1} h={20} />
                    <SegmentedControl
                        size="xs"
                        value={selectedKind}
                        onChange={(value) =>
                            setSelectedKind(value as DataAppActivityKind)
                        }
                        data={DATA_APP_ACTIVITY_KINDS.map((kind) => ({
                            label: t(`dataAppActivity.kinds.${kind}`),
                            value: kind,
                        }))}
                    />
                    {hasActiveFilters && (
                        <>
                            <Divider orientation="vertical" w={1} h={20} />
                            <Button
                                variant="subtle"
                                size="xs"
                                leftSection={
                                    <MantineIcon icon={IconTrash} size="sm" />
                                }
                                onClick={resetFilters}
                            >
                                {t('dataAppActivity.filters.clearAll')}
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
                            ? t('dataAppActivity.loading')
                            : hasNextPage
                              ? t('dataAppActivity.partialCount', {
                                    current: currentResultsCount,
                                    total: totalResults,
                                })
                              : t('dataAppActivity.totalCount', {
                                    count: totalResults,
                                })}
                    </Text>
                </Box>
            </Group>
            <Divider color="ldGray.2" />
        </Box>
    );
};
