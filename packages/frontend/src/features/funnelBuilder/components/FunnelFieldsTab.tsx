import {
    type CompiledDimension,
    DimensionType,
    getDimensions,
    getItemId,
} from '@lightdash/common';
import { Select, Stack } from '@mantine-8/core';
import { type FC, useMemo } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectBreakdownDimensionId,
    selectEventNameFieldId,
    selectExploreName,
    selectTimestampFieldId,
    selectUserIdFieldId,
    setBreakdownDimensionId,
    setEventNameFieldId,
    setExploreName,
    setTimestampFieldId,
    setUserIdFieldId,
} from '../store/funnelBuilderSlice';

type SelectItem = { value: string; label: string };
type SelectGroup = { group: string; items: SelectItem[] };

/**
 * Sort fields alphabetically by label and convert to Select items.
 */
function toSortedSelectItems(fields: CompiledDimension[]): SelectItem[] {
    return [...fields]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((d) => ({ value: getItemId(d), label: d.label }));
}

/**
 * Build grouped select data with suggested fields at top.
 * Suggested fields are those whose name starts with the given prefix.
 */
function buildGroupedSelectData(
    fields: CompiledDimension[],
    suggestedPrefix: string,
): SelectGroup[] | SelectItem[] {
    const suggested = fields.filter((d) =>
        d.name.toLowerCase().startsWith(suggestedPrefix.toLowerCase()),
    );
    const others = fields.filter(
        (d) => !d.name.toLowerCase().startsWith(suggestedPrefix.toLowerCase()),
    );

    // If no suggested fields, return flat sorted list
    if (suggested.length === 0) {
        return toSortedSelectItems(fields);
    }

    return [
        { group: 'Suggested', items: toSortedSelectItems(suggested) },
        { group: 'All Fields', items: toSortedSelectItems(others) },
    ];
}

type Props = {
    projectUuid: string;
};

export const FunnelFieldsTab: FC<Props> = ({ projectUuid }) => {
    const dispatch = useAppDispatch();

    // Redux state
    const exploreName = useAppSelector(selectExploreName);
    const timestampFieldId = useAppSelector(selectTimestampFieldId);
    const userIdFieldId = useAppSelector(selectUserIdFieldId);
    const eventNameFieldId = useAppSelector(selectEventNameFieldId);
    const breakdownDimensionId = useAppSelector(selectBreakdownDimensionId);

    // Data fetching (React Query)
    const { data: explores, isLoading: isLoadingExplores } = useExplores(
        projectUuid,
        true,
    );
    const { data: explore, isLoading: isLoadingExplore } = useExplore(
        exploreName ?? undefined,
    );

    // Derived data
    const dimensions = useMemo(() => {
        if (!explore) return [];
        return getDimensions(explore).filter(
            (d) => d.table === explore.baseTable,
        );
    }, [explore]);

    const timestampFields = useMemo(
        () =>
            dimensions.filter(
                (d) =>
                    d.type === DimensionType.TIMESTAMP ||
                    d.type === DimensionType.DATE,
            ),
        [dimensions],
    );

    const stringFields = useMemo(
        () => dimensions.filter((d) => d.type === DimensionType.STRING),
        [dimensions],
    );

    // Build select data with alphabetical sorting and suggested groups
    const exploreSelectData = useMemo(
        () =>
            [...(explores ?? [])]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((e) => ({ value: e.name, label: e.label })),
        [explores],
    );

    const timestampSelectData = useMemo(
        () => toSortedSelectItems(timestampFields),
        [timestampFields],
    );

    const userIdSelectData = useMemo(
        () => buildGroupedSelectData(stringFields, 'user'),
        [stringFields],
    );

    const eventNameSelectData = useMemo(
        () => buildGroupedSelectData(stringFields, 'event'),
        [stringFields],
    );

    const breakdownSelectData = useMemo(
        () => toSortedSelectItems(stringFields),
        [stringFields],
    );

    return (
        <Stack gap="md">
            <Select
                label="Explore"
                placeholder="Select an explore"
                searchable
                data={exploreSelectData}
                value={exploreName}
                onChange={(value) => dispatch(setExploreName(value))}
                disabled={isLoadingExplores}
            />

            {exploreName && (
                <>
                    <Select
                        label="Timestamp Field"
                        placeholder="Select timestamp"
                        searchable
                        data={timestampSelectData}
                        value={timestampFieldId}
                        onChange={(value) =>
                            dispatch(setTimestampFieldId(value))
                        }
                        disabled={isLoadingExplore}
                    />

                    <Select
                        label="User ID Field"
                        placeholder="Select user identifier"
                        searchable
                        data={userIdSelectData}
                        value={userIdFieldId}
                        onChange={(value) => dispatch(setUserIdFieldId(value))}
                        disabled={isLoadingExplore}
                    />

                    <Select
                        label="Event Name Field"
                        placeholder="Select event name"
                        searchable
                        data={eventNameSelectData}
                        value={eventNameFieldId}
                        onChange={(value) =>
                            dispatch(setEventNameFieldId(value))
                        }
                        disabled={isLoadingExplore}
                    />

                    <Select
                        label="Breakdown (Optional)"
                        placeholder="Select breakdown"
                        searchable
                        clearable
                        data={breakdownSelectData}
                        value={breakdownDimensionId}
                        onChange={(value) =>
                            dispatch(setBreakdownDimensionId(value))
                        }
                        disabled={isLoadingExplore}
                    />
                </>
            )}
        </Stack>
    );
};
