import { subject } from '@casl/ability';
import { ExploreType, type SummaryExplore } from '@lightdash/common';
import {
    ActionIcon,
    Divider,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
    explorerActions,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { defaultState } from '../../../providers/Explorer/defaultState';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import ExplorePanel from '../ExplorePanel';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import ExploreGroup from './ExploreGroup';
import ExploreNavLink from './ExploreNavLink';

const LoadingSkeleton = () => (
    <Stack>
        <Skeleton h="md" />

        <Skeleton h="xxl" />

        <Stack spacing="xxs">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
                <Skeleton key={index} h="xxl" />
            ))}
        </Stack>
    </Stack>
);

const BasePanel = () => {
    const navigate = useNavigate();
    const projectUuid = useProjectUuid();
    const [search, setSearch] = useState<string>('');
    const exploresResult = useExplores(projectUuid, true);
    const { data: org } = useOrganization();

    const [exploreGroupMap, defaultUngroupedExplores, customUngroupedExplores] =
        useMemo(() => {
            const validSearch = search ? search.toLowerCase() : '';
            if (exploresResult.data) {
                let explores = Object.values(exploresResult.data);
                if (validSearch !== '') {
                    explores = new Fuse(Object.values(exploresResult.data), {
                        keys: ['label'],
                        ignoreLocation: true,
                        threshold: 0.3,
                    })
                        .search(validSearch)
                        .map((res) => res.item);
                }

                return explores.reduce<
                    [
                        Record<string, SummaryExplore[]>,
                        SummaryExplore[],
                        SummaryExplore[],
                    ]
                >(
                    (acc, explore) => {
                        if (explore.groupLabel) {
                            return [
                                {
                                    ...acc[0],
                                    [explore.groupLabel]: acc[0][
                                        explore.groupLabel
                                    ]
                                        ? [
                                              ...acc[0][explore.groupLabel],
                                              explore,
                                          ]
                                        : [explore],
                                },
                                acc[1],
                                acc[2],
                            ];
                        }
                        if (explore.type === ExploreType.VIRTUAL) {
                            return [acc[0], acc[1], [...acc[2], explore]];
                        }
                        return [acc[0], [...acc[1], explore], acc[2]];
                    },
                    [{}, [], []],
                );
            }
            return [{}, [], []];
        }, [exploresResult.data, search]);

    if (exploresResult.status === 'loading') {
        return <LoadingSkeleton />;
    }

    if (exploresResult.status === 'error') {
        return (
            <SuboptimalState
                icon={IconAlertCircle}
                title="Could not load explores"
            />
        );
    }

    if (exploresResult.data) {
        return (
            <>
                <ItemDetailProvider>
                    <Stack h="100%" sx={{ flexGrow: 1 }}>
                        <Can
                            I="manage"
                            this={subject('Explore', {
                                organizationUuid: org?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <PageBreadcrumbs
                                size="md"
                                items={[{ title: 'Tables', active: true }]}
                            />
                        </Can>

                        <TextInput
                            icon={<MantineIcon icon={IconSearch} />}
                            rightSection={
                                search ? (
                                    <ActionIcon onClick={() => setSearch('')}>
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                ) : null
                            }
                            placeholder="Search tables"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <Stack
                            spacing="xxs"
                            sx={{ flexGrow: 1, overflowY: 'auto' }}
                        >
                            {Object.keys(exploreGroupMap)
                                .sort((a, b) => a.localeCompare(b))
                                .map((groupLabel) => (
                                    <ExploreGroup
                                        label={groupLabel}
                                        key={groupLabel}
                                    >
                                        {exploreGroupMap[groupLabel]
                                            .sort((a, b) =>
                                                a.label.localeCompare(b.label),
                                            )
                                            .map((explore) => (
                                                <ExploreNavLink
                                                    key={explore.name}
                                                    explore={explore}
                                                    query={search}
                                                    onClick={() => {
                                                        void navigate(
                                                            `/projects/${projectUuid}/tables/${explore.name}`,
                                                        );
                                                    }}
                                                />
                                            ))}
                                    </ExploreGroup>
                                ))}
                            {defaultUngroupedExplores
                                .sort((a, b) => a.label.localeCompare(b.label))
                                .map((explore) => (
                                    <ExploreNavLink
                                        key={explore.name}
                                        explore={explore}
                                        query={search}
                                        onClick={() => {
                                            void navigate(
                                                `/projects/${projectUuid}/tables/${explore.name}`,
                                            );
                                        }}
                                    />
                                ))}

                            {customUngroupedExplores.length ? (
                                <>
                                    <Divider size={0.5} c="gray.5" my="xs" />

                                    <Text fw={500} fz="xs" c="gray.6" mb="xs">
                                        Virtual Views
                                    </Text>
                                </>
                            ) : null}

                            {customUngroupedExplores
                                .sort((a, b) => a.label.localeCompare(b.label))
                                .map((explore) => (
                                    <ExploreNavLink
                                        key={explore.name}
                                        explore={explore}
                                        query={search}
                                        onClick={() => {
                                            void navigate(
                                                `/projects/${projectUuid}/tables/${explore.name}`,
                                            );
                                        }}
                                    />
                                ))}
                        </Stack>
                    </Stack>
                </ItemDetailProvider>
            </>
        );
    }

    return (
        <SuboptimalState
            icon={IconAlertTriangle}
            title="Could not load explores"
        />
    );
};

const ExploreSideBar = memo(() => {
    const projectUuid = useProjectUuid();
    // Get table name from Redux
    const tableName = useExplorerSelector(selectTableName);
    const ability = useAbilityContext();
    const { data: org } = useOrganization();

    // Use Redux and query client directly - no Context needed!
    const queryClient = useQueryClient();
    const dispatch = useExplorerDispatch();
    const navigate = useNavigate();

    const clearExplore = useCallback(async () => {
        // Cancel any pending query creation
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });
        // Reset Redux store to default state
        dispatch(explorerActions.reset(defaultState));
        // Reset query execution state
        dispatch(explorerActions.resetQueryExecution());
    }, [queryClient, dispatch]);

    const canManageExplore = ability.can(
        'manage',
        subject('Explore', {
            organizationUuid: org?.organizationUuid,
            projectUuid,
        }),
    );
    const handleBack = useCallback(() => {
        void clearExplore();
        void navigate(`/projects/${projectUuid}/tables`);
    }, [clearExplore, navigate, projectUuid]);

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            {!tableName ? (
                <BasePanel />
            ) : (
                <ExplorePanel
                    onBack={canManageExplore ? handleBack : undefined}
                />
            )}
        </TrackSection>
    );
});

export default ExploreSideBar;
