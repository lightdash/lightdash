import { subject } from '@casl/ability';
import { type SummaryExplore, ExploreType } from '@lightdash/common';
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
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import VirtualizedExploreList from './VirtualizedExploreList';

const BasePanel = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const projectUuid = useProjectUuid();
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [, startTransition] = useTransition();
    const exploresResult = useExplores(projectUuid, true);
    const { data: org } = useOrganization();

    const filteredExplores = useMemo(() => {
        const searchStart = performance.now();
        const validSearch = debouncedSearch
            ? debouncedSearch.toLowerCase()
            : '';
        if (exploresResult.data) {
            console.log(
                `🔍 Processing ${Object.values(exploresResult.data).length} explores with search: "${debouncedSearch}"`,
            );
            let explores = Object.values(exploresResult.data);
            if (validSearch !== '') {
                const fuseStart = performance.now();
                explores = new Fuse(Object.values(exploresResult.data), {
                    keys: ['label'],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(validSearch)
                    .map((res) => res.item);
                console.log(
                    `🔍 Fuse.js search took ${((performance.now() - fuseStart) / 1000).toFixed(3)}s`,
                );
                console.log(`🔍 Search returned ${explores.length} results`);
            }
            console.log(
                `🔍 Search/Filter computation took ${((performance.now() - searchStart) / 1000).toFixed(3)}s`,
            );
            return explores;
        }
        console.log(
            `🔍 Search/Filter computation took ${((performance.now() - searchStart) / 1000).toFixed(3)}s`,
        );
        return undefined;
    }, [exploresResult.data, debouncedSearch]);

    const [
        sortedGroupLabels,
        exploreGroupMap,
        defaultUngroupedExplores,
        customUngroupedExplores,
    ] = useMemo<
        [
            string[],
            Record<string, SummaryExplore[]>,
            SummaryExplore[],
            SummaryExplore[],
        ]
    >(() => {
        const categorizationStart = performance.now();
        if (filteredExplores) {
            console.log(
                `📋 Categorizing ${filteredExplores.length} explores into groups`,
            );

            // Pre-allocate collections for better performance
            const groupMap: Record<string, SummaryExplore[]> = {};
            const defaultExplores: SummaryExplore[] = [];
            const customExplores: SummaryExplore[] = [];

            // Single-pass categorization without object spreads
            for (const explore of filteredExplores) {
                if (explore.groupLabel) {
                    if (groupMap[explore.groupLabel]) {
                        groupMap[explore.groupLabel].push(explore);
                    } else {
                        groupMap[explore.groupLabel] = [explore];
                    }
                } else if (explore.type === ExploreType.VIRTUAL) {
                    customExplores.push(explore);
                } else {
                    defaultExplores.push(explore);
                }
            }

            // Pre-sort group labels once
            const sortedLabels = Object.keys(groupMap).sort((a, b) =>
                a.localeCompare(b),
            );

            // Sort explores within each group
            for (const groupLabel of sortedLabels) {
                groupMap[groupLabel].sort((a, b) =>
                    a.label.localeCompare(b.label),
                );
            }

            // Sort ungrouped explores
            defaultExplores.sort((a, b) => a.label.localeCompare(b.label));
            customExplores.sort((a, b) => a.label.localeCompare(b.label));

            console.log(
                `📋 Created ${sortedLabels.length} groups, ${defaultExplores.length} default explores, ${customExplores.length} virtual explores`,
            );
            console.log(
                `📋 Group categorization took ${((performance.now() - categorizationStart) / 1000).toFixed(3)}s`,
            );
            return [sortedLabels, groupMap, defaultExplores, customExplores];
        }
        console.log(
            `📋 Group categorization took ${((performance.now() - categorizationStart) / 1000).toFixed(3)}s`,
        );
        return [[], {}, [], []];
    }, [filteredExplores]);

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
                            sortedGroupLabels={sortedGroupLabels}
                            exploreGroupMap={exploreGroupMap}
                            defaultUngroupedExplores={defaultUngroupedExplores}
                            customUngroupedExplores={customUngroupedExplores}
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
