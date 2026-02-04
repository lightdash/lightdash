import {
    getDateCalcUtils,
    getDefaultMetricTreeNodeDateRange,
    getRollingPeriodDates,
} from '@lightdash/common';
import { Select, Tooltip } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSelectStyles } from '../../styles/useSelectStyles';
import {
    DEFAULT_CANVAS_TIME_OPTIONS,
    type CanvasTimeOption,
} from './canvasTimeFramePickerOptions';

const DATE_FORMAT = 'MMM D, YYYY';

const getCanvasTimeDateLabel = (option: CanvasTimeOption): string => {
    if (option.type === 'rolling') {
        const { current, previous } = getRollingPeriodDates(option.rollingDays);
        return `${previous.start.format(DATE_FORMAT)} - ${previous.end.format(DATE_FORMAT)} / ${current.start.format(DATE_FORMAT)} - ${current.end.format(DATE_FORMAT)}`;
    }
    const [currentStart, currentEnd] = getDefaultMetricTreeNodeDateRange(
        option.timeFrame,
    );
    const { back } = getDateCalcUtils(option.timeFrame);
    const previousStart = back(currentStart);
    const previousEnd = back(currentEnd);
    return `${dayjs(currentStart).format(DATE_FORMAT)} - ${dayjs(currentEnd).format(DATE_FORMAT)} / ${dayjs(previousStart).format(DATE_FORMAT)} - ${dayjs(previousEnd).format(DATE_FORMAT)}`;
};

const serializeOption = (option: CanvasTimeOption): string =>
    option.type === 'calendar'
        ? `calendar:${option.timeFrame}`
        : `rolling:${option.rollingDays}`;

type Props = {
    value: CanvasTimeOption;
    onChange: (value: CanvasTimeOption) => void;
    options?: CanvasTimeOption[];
    width?: number;
};

export const CanvasTimeFramePicker: FC<Props> = ({
    value,
    onChange,
    options = DEFAULT_CANVAS_TIME_OPTIONS,
    width = 185,
}) => {
    const { classes } = useSelectStyles();

    const selectData = options.map((option) => ({
        value: serializeOption(option),
        label: option.label,
    }));

    const tooltipLabel = useMemo(() => getCanvasTimeDateLabel(value), [value]);

    return (
        <Tooltip label={tooltipLabel} position="bottom" withArrow>
            <Select
                w={width}
                size="xs"
                radius="md"
                data={selectData}
                value={serializeOption(value)}
                onChange={(val) => {
                    const selected = options.find(
                        (opt) => serializeOption(opt) === val,
                    );
                    if (selected) onChange(selected);
                }}
                withinPortal
                rightSection={
                    <MantineIcon
                        color="ldGray.7"
                        icon={IconChevronDown}
                        size={12}
                    />
                }
                classNames={{
                    input: classes.input,
                    item: classes.item,
                    rightSection: classes.rightSection,
                }}
            />
        </Tooltip>
    );
};
