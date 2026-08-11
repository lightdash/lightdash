import {
    FeatureFlags,
    getItemId,
    isDimension,
    type Explore,
} from '@lightdash/common';
import {
    Badge,
    Group,
    NavLink,
    ScrollArea,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useMerge, useMergeSafe } from '../context/useMerge';

type FieldOption = { id: string; label: string; table: string };

const getFields = (explore: Explore | undefined, wantDimensions: boolean) => {
    if (!explore) return [];
    return Object.values(explore.tables).flatMap((table) =>
        Object.values(
            wantDimensions ? table.dimensions : table.metrics,
        ).flatMap((field) =>
            wantDimensions && !isDimension(field)
                ? []
                : [
                      {
                          id: getItemId(field),
                          label: field.label,
                          table: table.label,
                      } satisfies FieldOption,
                  ],
        ),
    );
};

/**
 * The field picker for the second query.
 *
 * Deliberately the same shape as the explore sidebar rather than a control
 * inside the merge strip: picking fields is picking fields, and a merge should
 * not ask people to learn a second, worse way to do it.
 */
const QueryBFields: FC = () => {
    const projectUuid = useProjectUuid();
    const { data: explores } = useExplores(projectUuid);
    const { queryB, setExploreB, toggleFieldB } = useMerge();
    const { data: explore } = useExplore(queryB.exploreName ?? undefined);
    const [search, setSearch] = useState('');

    const dimensions = useMemo(() => getFields(explore, true), [explore]);
    const metrics = useMemo(() => getFields(explore, false), [explore]);

    const matches = (field: FieldOption) =>
        search.trim() === '' ||
        `${field.table} ${field.label}`
            .toLowerCase()
            .includes(search.trim().toLowerCase());

    const renderGroup = (
        title: string,
        fields: FieldOption[],
        selected: string[],
        isDimensionGroup: boolean,
    ) => {
        const visible = fields.filter(matches);
        if (visible.length === 0) return null;
        return (
            <Stack gap={2}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="xs">
                    {title}
                </Text>
                {visible.map((field) => (
                    <NavLink
                        key={field.id}
                        label={field.label}
                        description={field.table}
                        active={selected.includes(field.id)}
                        onClick={() => toggleFieldB(field.id, isDimensionGroup)}
                    />
                ))}
            </Stack>
        );
    };

    return (
        <Stack gap="xs" h="100%">
            <Group gap="xs">
                <Badge color="orange" variant="light">
                    Query B
                </Badge>
                <Text size="xs" c="dimmed">
                    fields for the second query
                </Text>
            </Group>

            <Select
                placeholder="Pick an explore"
                data={(explores ?? []).map((option) => ({
                    value: option.name,
                    label: option.label,
                }))}
                value={queryB.exploreName}
                onChange={setExploreB}
                searchable
            />

            {queryB.exploreName && (
                <>
                    <TextInput
                        placeholder="Search fields"
                        value={search}
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                    />
                    <ScrollArea.Autosize mah="calc(100vh - 260px)">
                        <Stack gap="sm">
                            {renderGroup(
                                'Dimensions',
                                dimensions,
                                queryB.dimensions,
                                true,
                            )}
                            {renderGroup(
                                'Metrics',
                                metrics,
                                queryB.metrics,
                                false,
                            )}
                        </Stack>
                    </ScrollArea.Autosize>
                </>
            )}
        </Stack>
    );
};

/**
 * Swaps the sidebar to the focused query's fields. Query A keeps the explorer's
 * own sidebar untouched, so nothing about the familiar path changes until a
 * second query exists.
 */
export const MergeSidebar: FC<{ fallback: ReactNode }> = ({ fallback }) => {
    const merge = useMergeSafe();
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);

    if (
        mergeFlag?.enabled === true &&
        merge?.isMerging &&
        merge.focus === 'b'
    ) {
        return <QueryBFields />;
    }
    return <>{fallback}</>;
};
