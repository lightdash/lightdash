import {
    DimensionType,
    getDimensions,
    getItemId,
    type CompiledDimension,
} from '@lightdash/common';
import { Select, Stack } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';

type SelectItem = { value: string; label: string };
type SelectGroup = { group: string; items: SelectItem[] };

function toSortedSelectItems(fields: CompiledDimension[]): SelectItem[] {
    return [...fields]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((d) => ({ value: getItemId(d), label: d.label }));
}

/** Group fields whose name starts with the prefix under "Suggested". */
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

    if (suggested.length === 0) {
        return toSortedSelectItems(fields);
    }

    return [
        { group: 'Suggested', items: toSortedSelectItems(suggested) },
        { group: 'All Fields', items: toSortedSelectItems(others) },
    ];
}

export type EventFieldsFormValues = {
    exploreName: string | null;
    timestampFieldId: string | null;
    userIdFieldId: string | null;
    eventNameFieldId: string | null;
    breakdownDimensionId: string | null;
};

type Props = EventFieldsFormValues & {
    projectUuid: string;
    onExploreChange: (value: string | null) => void;
    onTimestampFieldChange: (value: string | null) => void;
    onUserIdFieldChange: (value: string | null) => void;
    onEventNameFieldChange: (value: string | null) => void;
    onBreakdownChange: (value: string | null) => void;
};

/**
 * Maps an explore onto an event stream (timestamp, user, event name).
 * Shared by every event analytics builder (funnel, retention).
 */
export const EventFieldsForm: FC<Props> = ({
    projectUuid,
    exploreName,
    timestampFieldId,
    userIdFieldId,
    eventNameFieldId,
    breakdownDimensionId,
    onExploreChange,
    onTimestampFieldChange,
    onUserIdFieldChange,
    onEventNameFieldChange,
    onBreakdownChange,
}) => {
    const { data: explores, isLoading: isLoadingExplores } = useExplores(
        projectUuid,
        true,
    );
    const { data: explore, isLoading: isLoadingExplore } = useExplore(
        exploreName ?? undefined,
    );

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
                selectFirstOptionOnChange
                data={exploreSelectData}
                value={exploreName}
                onChange={onExploreChange}
                disabled={isLoadingExplores}
            />

            {exploreName && (
                <>
                    <Select
                        label="Timestamp Field"
                        placeholder="Select timestamp"
                        searchable
                        selectFirstOptionOnChange
                        data={timestampSelectData}
                        value={timestampFieldId}
                        onChange={onTimestampFieldChange}
                        disabled={isLoadingExplore}
                    />

                    <Select
                        label="User ID Field"
                        placeholder="Select user identifier"
                        searchable
                        selectFirstOptionOnChange
                        data={userIdSelectData}
                        value={userIdFieldId}
                        onChange={onUserIdFieldChange}
                        disabled={isLoadingExplore}
                    />

                    <Select
                        label="Event Name Field"
                        placeholder="Select event name"
                        searchable
                        selectFirstOptionOnChange
                        data={eventNameSelectData}
                        value={eventNameFieldId}
                        onChange={onEventNameFieldChange}
                        disabled={isLoadingExplore}
                    />

                    <Select
                        label="Breakdown (Optional)"
                        placeholder="Select breakdown"
                        searchable
                        selectFirstOptionOnChange
                        clearable
                        data={breakdownSelectData}
                        value={breakdownDimensionId}
                        onChange={onBreakdownChange}
                        disabled={isLoadingExplore}
                    />
                </>
            )}
        </Stack>
    );
};
