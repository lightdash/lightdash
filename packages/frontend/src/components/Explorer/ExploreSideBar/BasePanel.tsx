import { subject } from '@casl/ability';
import {
    ExploreType,
    FeatureFlags,
    type SummaryExplore,
} from '@lightdash/common';
import { TextInput, Stack, ActionIcon, Button, Group } from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AddDataModal } from '../../../features/externalSources/components/AddDataModal';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectTableGroups } from '../../../hooks/useProjectTableGroups';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
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

type Props = {
    // Overrides the default navigation to the project's explore page. Embeds
    // use this to keep the selected table inside the embed route.
    onExploreClick?: (explore: SummaryExplore) => void;
    // Enables "Add data" in overridden-navigation contexts (the merge picker):
    // a table created through the upload modal is handed here instead of
    // navigating, so the host flow keeps its state.
    onExploreCreated?: (exploreName: string) => void;
};

const BasePanel = ({ onExploreClick, onExploreCreated }: Props) => {
    const navigate = useNavigate();
    const location = useLocation();
    const projectUuid = useProjectUuid();
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [, startTransition] = useTransition();
    const exploresResult = useExplores(projectUuid, true, true);
    const tableGroupsResult = useProjectTableGroups(projectUuid);
    const { data: org } = useOrganization();
    const { data: externalSourcesFlag } = useServerFeatureFlag(
        FeatureFlags.ExternalSources,
    );
    const [
        isAddDataModalOpen,
        { open: openAddDataModal, close: closeAddDataModal },
    ] = useDisclosure(false);
    // The modal navigates into the created table by default; inside embeds
    // and the merge picker (onExploreClick overridden) that navigation would
    // break the host flow, so the affordance only shows there when the host
    // handles the created table itself via onExploreCreated.
    const canShowAddData =
        externalSourcesFlag?.enabled === true &&
        (!onExploreClick || !!onExploreCreated) &&
        !!projectUuid;

    const filteredExplores = useMemo(() => {
        const validSearch = debouncedSearch
            ? debouncedSearch.toLowerCase()
            : '';
        if (exploresResult.data) {
            let explores = Object.values(exploresResult.data);
            if (validSearch !== '') {
                explores = new Fuse(Object.values(exploresResult.data), {
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
                if (externalSourcesFlag?.enabled === true) {
                    externalSourceExplores.push(explore);
                }
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
    }, [externalSourcesFlag?.enabled, filteredExplores, tableGroupDetails]);

    const handleExploreClick = useCallback(
        (explore: SummaryExplore) => {
            startTransition(() => {
                if (onExploreClick) {
                    onExploreClick(explore);
                    return;
                }
                void navigate({
                    pathname: `/projects/${projectUuid}/tables/${explore.name}`,
                    search: location.search,
                });
            });
        },
        [
            navigate,
            projectUuid,
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
            <>
                <ItemDetailProvider>
                    <Stack h="100%" flex={1}>
                        <Can
                            I="manage"
                            this={subject('Explore', {
                                organizationUuid: org?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <PageBreadcrumbs
                                    size="md"
                                    items={[{ title: 'Tables', active: true }]}
                                />
                                {canShowAddData && (
                                    <Can
                                        I="manage"
                                        this={subject('ExternalSource', {
                                            organizationUuid:
                                                org?.organizationUuid,
                                            projectUuid,
                                        })}
                                    >
                                        <Button
                                            variant="default"
                                            size="compact-xs"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconPlus}
                                                    size="sm"
                                                />
                                            }
                                            onClick={openAddDataModal}
                                        >
                                            Add data
                                        </Button>
                                    </Can>
                                )}
                            </Group>
                        </Can>

                        <TextInput
                            leftSection={<MantineIcon icon={IconSearch} />}
                            rightSectionPointerEvents="all"
                            radius="md"
                            rightSection={
                                search ? (
                                    <ActionIcon
                                        aria-label="Clear search"
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
                                        variant="subtle"
                                        color="gray"
                                        onClick={() => setSearch('')}
                                    >
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
                            externalSourceExplores={
                                sortedExternalSourceExplores
                            }
                            searchQuery={debouncedSearch}
                            onExploreClick={handleExploreClick}
                        />
                    </Stack>
                </ItemDetailProvider>
                {canShowAddData && projectUuid && (
                    <AddDataModal
                        projectUuid={projectUuid}
                        opened={isAddDataModalOpen}
                        onClose={closeAddDataModal}
                        onCreated={onExploreCreated}
                    />
                )}
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
