import { SummaryExplore } from '@lightdash/common';
import { ActionIcon, Skeleton, Stack, TextInput } from '@mantine/core';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { memo, useCallback, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useExplores } from '../../../hooks/useExplores';
import { ProjectCatalogTreeNode } from '../../../hooks/useProjectCatalogTree';
import { useCustomExplore } from '../../../providers/CustomExploreProvider';
import {
    ExploreMode,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import ExplorePanel from '../ExplorePanel';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailContext';
import ExploreGroup from './ExploreGroup';
import ExploreNavLink from './ExploreNavLink';
import ExploreProjectCatalog from './ExploreProjectCatalog';

const generateBasicSqlQuery = (table: string) =>
    `SELECT *
     FROM ${table} LIMIT 25`;

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
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [search, setSearch] = useState<string>('');
    const exploresResult = useExplores(projectUuid, true);

    const [exploreGroupMap, ungroupedExplores] = useMemo(() => {
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
                [Record<string, SummaryExplore[]>, SummaryExplore[]]
            >(
                (acc, explore) => {
                    if (explore.groupLabel) {
                        return [
                            {
                                ...acc[0],
                                [explore.groupLabel]: acc[0][explore.groupLabel]
                                    ? [...acc[0][explore.groupLabel], explore]
                                    : [explore],
                            },
                            acc[1],
                        ];
                    }
                    return [acc[0], [...acc[1], explore]];
                },
                [{}, []],
            );
        }
        return [{}, []];
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
                    <PageBreadcrumbs
                        size="md"
                        items={[{ title: 'Tables', active: true }]}
                    />

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
                                                    history.push(
                                                        `/projects/${projectUuid}/tables/${explore.name}`,
                                                    );
                                                }}
                                            />
                                        ))}
                                </ExploreGroup>
                            ))}
                        {ungroupedExplores
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((explore) => (
                                <ExploreNavLink
                                    key={explore.name}
                                    explore={explore}
                                    query={search}
                                    onClick={() => {
                                        history.push(
                                            `/projects/${projectUuid}/tables/${explore.name}`,
                                        );
                                    }}
                                />
                            ))}
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
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { setSql } = useCustomExplore();

    const tableName = useExplorerContext(
        (c) => c.state.unsavedChartVersion.tableName,
    );
    const mode = useExplorerContext((c) => c.state.mode);

    const customExplore = useExplorerContext((c) => c.state.customExplore);

    const metricQuery = useExplorerContext((c) => c.state.metricQuery);

    const clearExplore = useExplorerContext((c) => c.actions.clearExplore);
    const history = useHistory();

    const handleBack = useCallback(() => {
        clearExplore();
        history.push(`/projects/${projectUuid}/tables`);
    }, [clearExplore, history, projectUuid]);

    const handleTableSelect = useCallback(
        (node: ProjectCatalogTreeNode) => {
            if (!node.sqlTable) return;
            setSql(generateBasicSqlQuery(node.sqlTable));
        },
        [setSql],
    );

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <Stack h="100%" sx={{ flexGrow: 1 }}>
                {/* TODO: I don't like this approach, need to refactor */}
                {mode === ExploreMode.CREATE ? (
                    <ExploreProjectCatalog onSelect={handleTableSelect} />
                ) : tableName || (customExplore && metricQuery) ? (
                    <ExplorePanel onBack={handleBack} />
                ) : (
                    <BasePanel />
                )}
            </Stack>
        </TrackSection>
    );
});

export default ExploreSideBar;
