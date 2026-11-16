import { subject } from '@casl/ability';
import { ExploreType, type SummaryExplore } from '@lightdash/common';
import { TextInput, Stack, ActionIcon } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useExplores } from '../../../hooks/useExplores';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useProjectTableGroups } from '../../../hooks/useProjectTableGroups';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import { getBindingConnectionUuid } from '../../common/connectionName';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import {
    ExploreConnectionEmptyState,
    ExploreConnectionFilter,
} from './ExploreConnectionFilter';
import { buildExploreTree, sortExploreTree } from './exploreTree';
import { useExploreConnectionFilter } from './useExploreConnectionFilter';
import VirtualizedExploreList from './VirtualizedExploreList';

const getPreAggregateName = (explore: SummaryExplore) =>
    'preAggregateSource' in explore
        ? explore.preAggregateSource?.preAggregateName
        : undefined;

const exploreHasGroups = (explore: SummaryExplore): boolean =>
    !!(explore.groups && explore.groups.length > 0) || !!explore.groupLabel;

type Props = {
    // Overrides the default navigation to the project's explore page. Embeds
    // use this to keep the selected table inside the embed route.
    onExploreClick?: (explore: SummaryExplore) => void;
    // Leaves matching tables out of the list and its search.
    shouldHideExplore?: (explore: SummaryExplore) => boolean;
};

const BasePanel = ({ onExploreClick, shouldHideExplore }: Props) => {
    const navigate = useNavigate();
    const location = useLocation();
    const projectUuid = useProjectUuid();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [, startTransition] = useTransition();
    const exploresResult = useExplores(projectUuid, true, true);
    const { connections, connectionFilter, setConnectionFilter } =
        useExploreConnectionFilter(projectUuid);
    const tableGroupsResult = useProjectTableGroups(projectUuid);
    const { data: org } = useOrganization();

    const filteredExplores = useMemo(() => {
        const validSearch = debouncedSearch
            ? debouncedSearch.toLowerCase()
            : '';
        if (exploresResult.data) {
            let explores = Object.values(exploresResult.data);
            if (shouldHideExplore) {
                explores = explores.filter(
                    (explore) => !shouldHideExplore(explore),
                );
            }
            if (connections !== null && connectionFilter !== null) {
                explores = explores.filter(
                    (explore) =>
                        getBindingConnectionUuid(
                            connections,
                            explore.warehouseConnectionUuid,
                        ) === connectionFilter,
                );
            }
            if (validSearch !== '') {
                explores = new Fuse(explores, {
                    keys: [
                        { name: 'label', weight: 2 },
                        { name: 'name', weight: 2 },
                        {
                            name: 'preAggregateSource.preAggregateName',
                            weight: 2,
                        },
                        {
                            name: 'preAggregateSource.sourceExploreName',
                            weight: 2,
                        },
                        { name: 'groupLabel', weight: 1 },
                        { name: 'groups', weight: 1 },
                    ],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(validSearch)
                    .map((res) => res.item);
            }
            return explores;
        }
        return undefined;
    }, [
        exploresResult.data,
        debouncedSearch,
        connections,
        connectionFilter,
        shouldHideExplore,
    ]);

    const emptyConnectionName =
        connectionFilter !== null && filteredExplores?.length === 0
            ? (connections?.find(
                  ({ warehouseConnectionUuid }) =>
                      warehouseConnectionUuid === connectionFilter,
              )?.name ?? null)
            : null;

    const tableGroupDetails = useMemo(
        () => tableGroupsResult.data ?? {},
        [tableGroupsResult.data],
    );

    const [
        groupedExploreTree,
        defaultUngroupedExplores,
        customUngroupedExplores,
        sortedPreAggregateExplores,
        sortedExternalSourceExplores,
    ] = useMemo(() => {
        if (!filteredExplores) {
            return [
                [],
                [] as SummaryExplore[],
                [] as SummaryExplore[],
                [] as SummaryExplore[],
                [] as SummaryExplore[],
            ];
        }
        const groupedExplores: SummaryExplore[] = [];
        const defaultExplores: SummaryExplore[] = [];
        const customExplores: SummaryExplore[] = [];
        const preAggregateExplores: SummaryExplore[] = [];
        const externalSourceExplores: SummaryExplore[] = [];

        for (const explore of filteredExplores) {
            if (explore.type === ExploreType.PRE_AGGREGATE) {
                preAggregateExplores.push(explore);
            } else if (explore.type === ExploreType.EXTERNAL_SOURCE) {
                externalSourceExplores.push(explore);
            } else if (exploreHasGroups(explore)) {
                groupedExplores.push(explore);
            } else if (explore.type === ExploreType.VIRTUAL) {
                customExplores.push(explore);
            } else {
                defaultExplores.push(explore);
            }
        }

        const tree = sortExploreTree(
            buildExploreTree(groupedExplores, tableGroupDetails),
        );

        defaultExplores.sort((a, b) => a.label.localeCompare(b.label));
        customExplores.sort((a, b) => a.label.localeCompare(b.label));
        externalSourceExplores.sort((a, b) => a.label.localeCompare(b.label));
        preAggregateExplores.sort((a, b) =>
            (getPreAggregateName(a) ?? '').localeCompare(
                getPreAggregateName(b) ?? '',
            ),
        );

        return [
            tree,
            defaultExplores,
            customExplores,
            preAggregateExplores,
            externalSourceExplores,
        ];
    }, [filteredExplores, tableGroupDetails]);

    const handleExploreClick = useCallback(
        (explore: SummaryExplore) => {
            startTransition(() => {
                if (onExploreClick) {
                    onExploreClick(explore);
                    return;
                }
                void navigate({
                    pathname: `/projects/${projectUrlIdentifier}/tables/${explore.name}`,
                    search: location.search,
                });
            });
        },
        [
            navigate,
            projectUrlIdentifier,
            location.search,
            startTransition,
            onExploreClick,
        ],
    );

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
            <ItemDetailProvider>
                <Stack
                    h="100%"
                    flex={1}
                    data-tour-scope="delete:VirtualView"
                    data-tour-step="1"
                    data-tour-route="/projects/:projectUuid/tables"
                    data-tour-label="Inspect the available tables"
                    data-tour-docs="semantic-layer/virtual-views.mdx#edit-or-delete-a-virtual-view:1"
                    data-tour-return="none"
                    data-tour-resultdocs="semantic-layer/virtual-views.mdx#edit-or-delete-a-virtual-view:1"
                >
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
                        leftSection={<MantineIcon icon={IconSearch} />}
                        rightSectionPointerEvents="all"
                        rightSection={
                            search ? (
                                <ActionIcon
                                    aria-label="Clear search"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() => setSearch('')}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        placeholder="Search tables"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        // Typed anchor for scope walkthroughs: the list
                        // is virtualised, so a table far down it is
                        // reached by searching for it.
                        data-tour-anchor="explore-search"
                        data-tour-hint="Search for the table"
                        data-tour-input="true"
                        data-tour-suggest="Orders by status"
                    />

                    {connections !== null && (
                        <ExploreConnectionFilter
                            connections={connections}
                            connectionFilter={connectionFilter}
                            onChange={setConnectionFilter}
                        />
                    )}

                    {emptyConnectionName !== null ? (
                        <ExploreConnectionEmptyState
                            connectionName={emptyConnectionName}
                            isSearching={debouncedSearch !== ''}
                        />
                    ) : (
                        <VirtualizedExploreList
                            groupedExploreTree={groupedExploreTree}
                            defaultUngroupedExplores={defaultUngroupedExplores}
                            customUngroupedExplores={customUngroupedExplores}
                            preAggregateExplores={sortedPreAggregateExplores}
                            externalSourceExplores={
                                sortedExternalSourceExplores
                            }
                            searchQuery={debouncedSearch}
                            connections={connections}
                            onExploreClick={handleExploreClick}
                        />
                    )}
                </Stack>
            </ItemDetailProvider>
        );
    }

    return (
        <SuboptimalState
            icon={IconAlertTriangle}
            title="Could not load explores"
        />
    );
};

export default BasePanel;
