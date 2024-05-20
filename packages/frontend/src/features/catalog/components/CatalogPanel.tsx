import { type SummaryExplore } from '@lightdash/common';
import { ActionIcon, Table, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplores } from '../../../hooks/useExplores';
import { CataloGroup } from './CatalogGroup';
import { CatalogItem } from './CatalogItem';

type Props = {
    projectUuid: string;
};

export const CatalogPanel: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
}) => {
    const history = useHistory();
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
    /*
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
    }*/

    if (exploresResult.data) {
        return (
            <>
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

                {Object.keys(exploreGroupMap)
                    .sort((a, b) => a.localeCompare(b))
                    .map((groupLabel) => (
                        <CataloGroup label={groupLabel} key={groupLabel}>
                            <Table>
                                <tbody>
                                    {exploreGroupMap[groupLabel]
                                        .sort((a, b) =>
                                            a.label.localeCompare(b.label),
                                        )
                                        .map((explore) => (
                                            <CatalogItem
                                                key={explore.name}
                                                explore={explore}
                                                onClick={() => {
                                                    history.push(
                                                        `/projects/${projectUuid}/tables/${explore.name}`,
                                                    );
                                                }}
                                            />
                                        ))}
                                </tbody>
                            </Table>
                        </CataloGroup>
                    ))}
                <Table>
                    <tbody>
                        {ungroupedExplores
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((explore) => (
                                <CatalogItem
                                    key={explore.name}
                                    explore={explore}
                                    onClick={() => {
                                        history.push(
                                            `/projects/${projectUuid}/tables/${explore.name}`,
                                        );
                                    }}
                                />
                            ))}
                    </tbody>
                </Table>
            </>
        );
    }
    return null;
    /*
    return (
        <SuboptimalState
            icon={IconAlertTriangle}
            title="Could not load explores"
        />
    );*/
};
