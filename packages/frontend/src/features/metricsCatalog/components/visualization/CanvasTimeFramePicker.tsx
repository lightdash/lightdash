import {
    getDateCalcUtils,
    getDefaultMetricTreeNodeDateRange,
    getRollingPeriodDates,
} from '@lightdash/common';
import { Group, Select, Text } from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import styles from './CanvasTimeFramePicker.module.css';
import {
    DEFAULT_CANVAS_TIME_OPTIONS,
    type CanvasTimeOption,
} from './canvasTimeFramePickerOptions';

const DATE_FORMAT = 'MMM D, YYYY';

type DateRangeInfo = {
    currentRange: string;
    previousRange: string;
};

const getDateRanges = (option: CanvasTimeOption): DateRangeInfo => {
    if (option.type === 'rolling') {
        const { current, previous } = getRollingPeriodDates(option.rollingDays);
        return {
            currentRange: `${current.start.format(DATE_FORMAT)} – ${current.end.format(DATE_FORMAT)}`,
            previousRange: `${previous.start.format(DATE_FORMAT)} – ${previous.end.format(DATE_FORMAT)}`,
        };
    }
    const [currentStart, currentEnd] = getDefaultMetricTreeNodeDateRange(
        option.timeFrame,
    );
    const { back } = getDateCalcUtils(option.timeFrame);
    const previousStart = back(currentStart);
    const previousEnd = back(currentEnd);
    return {
        currentRange: `${dayjs(currentStart).format(DATE_FORMAT)} – ${dayjs(currentEnd).format(DATE_FORMAT)}`,
        previousRange: `${dayjs(previousStart).format(DATE_FORMAT)} – ${dayjs(previousEnd).format(DATE_FORMAT)}`,
    };
};

const serializeOption = (option: CanvasTimeOption): string =>
    option.type === 'calendar'
        ? `calendar:${option.timeFrame}`
        : `rolling:${option.rollingDays}`;

type Props = {
    value: CanvasTimeOption;
    onChange: (value: CanvasTimeOption) => void;
    options?: CanvasTimeOption[];
};

export const CanvasTimeFramePicker: FC<Props> = ({
    value,
    onChange,
    options = DEFAULT_CANVAS_TIME_OPTIONS,
}) => {
    const selectData = options.map((option) => ({
        value: serializeOption(option),
        label: option.label,
    }));

    const dateRanges = useMemo(() => getDateRanges(value), [value]);

    return (
        <Group gap="xs" wrap="nowrap">
            <Group gap={0} wrap="nowrap">
                <Select
                    size="xs"
                    data={selectData}
                    value={serializeOption(value)}
                    onChange={(val) => {
                        const selected = options.find(
                            (opt) => serializeOption(opt) === val,
                        );
                        if (selected) onChange(selected);
                    }}
                    leftSection={
                        <MantineIcon
                            icon={IconCalendar}
                            color="ldGray.6"
                            size={14}
                        />
                    }
                    classNames={{
                        input: styles.input,
                        option: styles.option,
                        dropdown: styles.dropdown,
                        section: styles.section,
                    }}
                    withCheckIcon={false}
                />
                <Text
                    size="sm"
                    c="ldGray.7"
                    fw={500}
                    className={clsx(
                        styles.dateDisplay,
                        styles.dateDisplayGroupped,
                    )}
                >
                    {dateRanges.currentRange}
                </Text>
            </Group>
            <Text c="ldGray.6" fz={14} fw={500}>
                compared to
            </Text>
            <Text
                size="sm"
                c="ldGray.7"
                fw={500}
                className={styles.dateDisplay}
            >
                {dateRanges.previousRange}
            </Text>
        </Group>
    );
};
