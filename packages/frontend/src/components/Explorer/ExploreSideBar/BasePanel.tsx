import { subject } from '@casl/ability';
import { type SummaryExplore, ExploreType } from '@lightdash/common';
import { ActionIcon, Divider, Stack, Text, TextInput } from '@mantine/core';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, useTransition } from 'react';
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
import ExploreGroup from './ExploreGroup';
import ExploreNavLink from './ExploreNavLink';

const BasePanel = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const projectUuid = useProjectUuid();
    const [search, setSearch] = useState<string>('');
    const [, startTransition] = useTransition();
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

    const groupedExploreLinks = useMemo(
        () =>
            Object.keys(exploreGroupMap)
                .sort((a, b) => a.localeCompare(b))
                .map((groupLabel) => (
                    <ExploreGroup label={groupLabel} key={groupLabel}>
                        {exploreGroupMap[groupLabel]
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((explore) => (
                                <ExploreNavLink
                                    key={explore.name}
                                    explore={explore}
                                    query={search}
                                    onClick={() => {
                                        startTransition(() => {
                                            void navigate({
                                                pathname: `/projects/${projectUuid}/tables/${explore.name}`,
                                                search: location.search,
                                            });
                                        });
                                    }}
                                />
                            ))}
                    </ExploreGroup>
                )),
        [
            exploreGroupMap,
            navigate,
            projectUuid,
            search,
            startTransition,
            location.search,
        ],
    );

    const ungroupedExploreLinks = useMemo(
        () =>
            defaultUngroupedExplores
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((explore) => (
                    <ExploreNavLink
                        key={explore.name}
                        explore={explore}
                        query={search}
                        onClick={() => {
                            startTransition(() => {
                                void navigate({
                                    pathname: `/projects/${projectUuid}/tables/${explore.name}`,
                                    search: location.search,
                                });
                            });
                        }}
                    />
                )),
        [
            defaultUngroupedExplores,
            navigate,
            projectUuid,
            search,
            startTransition,
            location.search,
        ],
    );

    const customExploreLinks = useMemo(
        () =>
            customUngroupedExplores
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((explore) => (
                    <ExploreNavLink
                        key={explore.name}
                        explore={explore}
                        query={search}
                        onClick={() => {
                            startTransition(() => {
                                void navigate({
                                    pathname: `/projects/${projectUuid}/tables/${explore.name}`,
                                    search: location.search,
                                });
                            });
                        }}
                    />
                )),
        [
            customUngroupedExplores,
            navigate,
            projectUuid,
            search,
            startTransition,
            location.search,
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
                            {groupedExploreLinks}
                            {ungroupedExploreLinks}
                            {customUngroupedExplores.length ? (
                                <>
                                    <Divider size={0.5} c="ldGray.5" my="xs" />

                                    <Text fw={500} fz="xs" c="ldGray.6" mb="xs">
                                        Virtual Views
                                    </Text>
                                </>
                            ) : null}
                            {customExploreLinks}
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

export default BasePanel;
