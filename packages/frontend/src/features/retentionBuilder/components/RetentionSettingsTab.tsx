import { RETENTION_MAX_PERIODS } from '@lightdash/common';
import { Group, Loader, Select, Stack, Text, Tooltip } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { NumberInput } from '../../../components/common/NumberInput';
import { useAppDispatch, useAppSelector } from '../store';
import {
    selectBornEvent,
    selectCohortType,
    selectCriteria,
    selectEventNames,
    selectEventNamesLoading,
    selectMode,
    selectPeriods,
    selectReturnEvent,
    selectUnit,
    setBornEvent,
    setCohortType,
    setCriteria,
    setMode,
    setPeriods,
    setReturnEvent,
    setUnit,
} from '../store/retentionBuilderSlice';
import {
    RETENTION_COHORT_TYPE_OPTIONS,
    RETENTION_CRITERIA_OPTIONS,
    RETENTION_MODE_OPTIONS,
    RETENTION_UNIT_OPTIONS,
} from '../utils/retentionConfig';

const ANY_EVENT = '__any_event__';

const findOption = <T extends string>(
    options: { value: T }[],
    value: string | null,
): T | null => options.find((o) => o.value === value)?.value ?? null;

export const RetentionSettingsTab: FC = () => {
    const dispatch = useAppDispatch();

    const eventNames = useAppSelector(selectEventNames);
    const isLoadingEventNames = useAppSelector(selectEventNamesLoading);
    const bornEvent = useAppSelector(selectBornEvent);
    const returnEvent = useAppSelector(selectReturnEvent);
    const cohortType = useAppSelector(selectCohortType);
    const unit = useAppSelector(selectUnit);
    const periods = useAppSelector(selectPeriods);
    const criteria = useAppSelector(selectCriteria);
    const mode = useAppSelector(selectMode);

    const eventOptions = useMemo(
        () =>
            [...eventNames]
                .sort((a, b) => a.localeCompare(b))
                .map((e) => ({ value: e, label: e })),
        [eventNames],
    );

    const returnOptions = useMemo(
        () => [{ value: ANY_EVENT, label: 'Any event' }, ...eventOptions],
        [eventOptions],
    );

    const describe = (
        options: { value: string; label: string; description: string }[],
        value: string,
    ) => options.find((o) => o.value === value)?.description;

    return (
        <Stack gap="md">
            <Group gap="xs">
                <Text fw={600} size="sm">
                    Retention
                </Text>
                {isLoadingEventNames && <Loader size="xs" />}
            </Group>

            <Select
                label="Users who did"
                placeholder="Select an event"
                searchable
                data={eventOptions}
                value={bornEvent}
                onChange={(value) => dispatch(setBornEvent(value))}
                disabled={!eventNames.length}
            />

            <Select
                label="Came back and did"
                searchable
                data={returnOptions}
                value={returnEvent ?? ANY_EVENT}
                onChange={(value) =>
                    dispatch(
                        setReturnEvent(
                            value === null || value === ANY_EVENT
                                ? null
                                : value,
                        ),
                    )
                }
                disabled={!eventNames.length}
            />

            <Tooltip
                label={describe(RETENTION_COHORT_TYPE_OPTIONS, cohortType)}
                position="left"
                withArrow
            >
                <Select
                    label="Cohort type"
                    data={RETENTION_COHORT_TYPE_OPTIONS}
                    value={cohortType}
                    onChange={(value) => {
                        const next = findOption(
                            RETENTION_COHORT_TYPE_OPTIONS,
                            value,
                        );
                        if (next) dispatch(setCohortType(next));
                    }}
                    allowDeselect={false}
                />
            </Tooltip>

            <Text fw={600} size="sm" mt="md">
                Periods
            </Text>

            <Group gap="xs" wrap="nowrap">
                <Select
                    label="Unit"
                    data={RETENTION_UNIT_OPTIONS}
                    value={unit}
                    onChange={(value) => {
                        const next = findOption(RETENTION_UNIT_OPTIONS, value);
                        if (next) dispatch(setUnit(next));
                    }}
                    allowDeselect={false}
                    w={110}
                />
                <NumberInput
                    label="Periods"
                    value={periods}
                    onChange={(value) => {
                        const next = Number(value);
                        if (Number.isInteger(next) && next >= 1) {
                            dispatch(setPeriods(next));
                        }
                    }}
                    min={1}
                    max={RETENTION_MAX_PERIODS[unit]}
                    w={90}
                />
            </Group>

            <Tooltip
                label={describe(RETENTION_MODE_OPTIONS, mode)}
                position="left"
                withArrow
            >
                <Select
                    label="Alignment"
                    data={RETENTION_MODE_OPTIONS}
                    value={mode}
                    onChange={(value) => {
                        const next = findOption(RETENTION_MODE_OPTIONS, value);
                        if (next) dispatch(setMode(next));
                    }}
                    allowDeselect={false}
                />
            </Tooltip>

            <Tooltip
                label={describe(RETENTION_CRITERIA_OPTIONS, criteria)}
                position="left"
                withArrow
            >
                <Select
                    label="Count as retained"
                    data={RETENTION_CRITERIA_OPTIONS}
                    value={criteria}
                    onChange={(value) => {
                        const next = findOption(
                            RETENTION_CRITERIA_OPTIONS,
                            value,
                        );
                        if (next) dispatch(setCriteria(next));
                    }}
                    allowDeselect={false}
                />
            </Tooltip>
        </Stack>
    );
};
