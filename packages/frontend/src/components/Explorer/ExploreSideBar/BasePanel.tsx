import { subject } from '@casl/ability';
import { ExploreType, type SummaryExplore } from '@lightdash/common';
import { ActionIcon, Stack, TextInput } from '@mantine/core';
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
import { useProjectTableGroups } from '../../../hooks/useProjectTableGroups';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import { buildExploreTree, sortExploreTree } from './exploreTree';
import VirtualizedExploreList from './VirtualizedExploreList';

const getPreAggregateName = (explore: SummaryExplore) =>
    'preAggregateSource' in explore
        ? explore.preAggregateSource?.preAggregateName
        : undefined;

const exploreHasGroups = (explore: SummaryExplore): boolean =>
    !!(explore.groups && explore.groups.length > 0) || !!explore.groupLabel;

const BasePanel = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const projectUuid = useProjectUuid();
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [, startTransition] = useTransition();
    const exploresResult = useExplores(projectUuid, true, true);
    const tableGroupsResult = useProjectTableGroups(projectUuid);
    const { data: org } = useOrganization();

    const filteredExplores = useMemo(() => {
        const validSearch = debouncedSearch
            ? debouncedSearch.toLowerCase()
            : '';
        if (exploresResult.data) {
            let explores = Object.values(exploresResult.data);
            if (validSearch !== '') {
                explores = new Fuse(Object.values(exploresResult.data), {
                    keys: [
                        'label',
                        'name',
                        'preAggregateSource.preAggregateName',
                        'preAggregateSource.sourceExploreName',
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
    }, [exploresResult.data, debouncedSearch]);

    const tableGroupDetails = useMemo(
        () => tableGroupsResult.data ?? {},
        [tableGroupsResult.data],
    );

    const [
        groupedExploreTree,
        defaultUngroupedExplores,
        customUngroupedExplores,
        sortedPreAggregateExplores,
    ] = useMemo(() => {
        if (!filteredExplores) {
            return [
                [],
                [] as SummaryExplore[],
                [] as SummaryExplore[],
                [] as SummaryExplore[],
            ];
        }
        const groupedExplores: SummaryExplore[] = [];
        const defaultExplores: SummaryExplore[] = [];
        const customExplores: SummaryExplore[] = [];
        const preAggregateExplores: SummaryExplore[] = [];

        for (const explore of filteredExplores) {
            if (explore.type === ExploreType.PRE_AGGREGATE) {
                preAggregateExplores.push(explore);
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
        preAggregateExplores.sort((a, b) =>
            (getPreAggregateName(a) ?? '').localeCompare(
                getPreAggregateName(b) ?? '',
            ),
        );

        return [tree, defaultExplores, customExplores, preAggregateExplores];
    }, [filteredExplores, tableGroupDetails]);

    const handleExploreClick = useCallback(
        (explore: SummaryExplore) => {
            startTransition(() => {
                void navigate({
                    pathname: `/projects/${projectUuid}/tables/${explore.name}`,
                    search: location.search,
                });
            });
        },
        [navigate, projectUuid, location.search, startTransition],
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

                        <VirtualizedExploreList
                            groupedExploreTree={groupedExploreTree}
                            defaultUngroupedExplores={defaultUngroupedExplores}
                            customUngroupedExplores={customUngroupedExplores}
                            preAggregateExplores={sortedPreAggregateExplores}
                            searchQuery={debouncedSearch}
                            onExploreClick={handleExploreClick}
                        />
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

export default BasePanel;
