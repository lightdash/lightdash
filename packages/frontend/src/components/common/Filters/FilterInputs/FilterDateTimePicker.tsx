import {
    FeatureFlags,
    getTimezoneLabel,
    isValidTimezone,
} from '@lightdash/common';
import { Group, Text } from '@mantine-8/core';
import {
    DateTimePicker,
    type DateTimePickerProps,
    type DayOfWeek,
} from '@mantine/dates';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useProject } from '../../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useFiltersContext from '../useFiltersContext';
import styles from './FilterDateTimePicker.module.css';
import {
    shiftToProjectTimezone,
    unshiftFromProjectTimezone,
} from './FilterDateTimePicker.utils';
import InvalidDateInput from './InvalidDateInput';

dayjs.extend(utc);
dayjs.extend(timezone);

const SUBTEXT_DATE_FORMAT = 'ddd, DD MMM YYYY HH:mm:ss';

interface Props extends Omit<
    DateTimePickerProps,
    'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
> {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
    showTimezone?: boolean;
    invalidValue?: string;
}

const FilterDateTimePicker: FC<Props> = ({
    value,
    onChange,
    firstDayOfWeek,
    showTimezone = true,
    invalidValue,
    ...rest
}) => {
    const displayFormat = 'YYYY-MM-DD HH:mm:ss';
    const [replacementValue, setReplacementValue] = useState<Date | null>(null);

    const { projectUuid, metricQueryTimezone } = useFiltersContext();
    const { data: enableTimezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const { data: project } = useProject(projectUuid);

    const candidateTimezone =
        metricQueryTimezone ?? project?.queryTimezone ?? undefined;
    const projectTimezone =
        enableTimezoneSupportFlag?.enabled &&
        project?.useProjectTimezoneInFilters &&
        candidateTimezone &&
        isValidTimezone(candidateTimezone)
            ? candidateTimezone
            : undefined;

    const shiftedValue = useMemo(() => {
        if (!projectTimezone || !value) return value;
        return shiftToProjectTimezone(value, projectTimezone);
    }, [value, projectTimezone]);

    const handleChange = useCallback(
        (date: Date | null) => {
            if (!date) return;
            if (!projectTimezone) {
                onChange(date);
                return;
            }
            onChange(unshiftFromProjectTimezone(date, projectTimezone));
        },
        [onChange, projectTimezone],
    );

    const browserTimezone = useMemo(() => dayjs.tz.guess(), []);
    const subtext = useMemo(() => {
        if (!value) return '';
        if (projectTimezone) {
            return `Local time (${browserTimezone}): ${dayjs(value)
                .tz(browserTimezone)
                .format(SUBTEXT_DATE_FORMAT)}`;
        }
        return `UTC time: ${dayjs(value).utc().format(SUBTEXT_DATE_FORMAT)}`;
    }, [value, projectTimezone, browserTimezone]);

    const sideLabel = projectTimezone
        ? (getTimezoneLabel(projectTimezone) ?? projectTimezone)
        : browserTimezone;

    if (invalidValue) {
        return (
            <Group wrap="nowrap" gap="xs" align="start" w="100%">
                <InvalidDateInput
                    value={invalidValue}
                    disabled={rest.disabled}
                    popoverProps={rest.popoverProps}
                    autoFocus={rest.autoFocus}
                >
                    {({ close }) => (
                        // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                        // @ts-ignore
                        <DateTimePicker
                            size="xs"
                            w="100%"
                            miw={185}
                            placeholder={invalidValue}
                            valueFormat={displayFormat}
                            firstDayOfWeek={firstDayOfWeek}
                            minDate={rest.minDate}
                            maxDate={rest.maxDate}
                            value={replacementValue}
                            withSeconds={rest.withSeconds}
                            timeInputProps={rest.timeInputProps}
                            submitButtonProps={{
                                ...rest.submitButtonProps,
                                onClick: (event) => {
                                    rest.submitButtonProps?.onClick?.(event);
                                    if (replacementValue) {
                                        handleChange(replacementValue);
                                        close();
                                    }
                                },
                            }}
                            onChange={(date) => {
                                setReplacementValue(date);
                            }}
                        />
                    )}
                </InvalidDateInput>
                {showTimezone && (
                    <Text fz="xs" c="dimmed" mt={7} className={styles.noWrap}>
                        {sideLabel}
                    </Text>
                )}
            </Group>
        );
    }

    return (
        <Group wrap="nowrap" gap="xs" align="start" w="100%">
            {/* // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
            // @ts-ignore */}
            <DateTimePicker
                size="xs"
                w="100%"
                miw={185}
                valueFormat={displayFormat}
                {...rest}
                popoverProps={{ shadow: 'sm', ...rest.popoverProps }}
                firstDayOfWeek={firstDayOfWeek}
                value={shiftedValue}
                onChange={handleChange}
                inputWrapperOrder={['input', 'description']}
                description={
                    <Text ml="two" fz="xs" c="dimmed">
                        {subtext}
                    </Text>
                }
            />
            {showTimezone && (
                <Text fz="xs" c="dimmed" mt={7} className={styles.noWrap}>
                    {sideLabel}
                </Text>
            )}
        </Group>
    );
};

export default FilterDateTimePicker;
