import {
    getTimezoneLabel,
    isTimeZone,
    PROJECT_TIMEZONE_SETTING,
    toTimezoneSetting,
    USER_TIMEZONE_SETTING,
    type TimezoneSetting,
} from '@lightdash/common';
import {
    CheckIcon,
    Group,
    Select,
    Text,
    Tooltip,
    type SelectProps,
} from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import MantineIcon from '../MantineIcon';
import classes from './ChartTimezoneSelect.module.css';
import { getChartTimezoneSelectData } from './getChartTimezoneSelectData';

interface Props extends Omit<
    SelectProps,
    'data' | 'value' | 'onChange' | 'defaultValue'
> {
    value: string | undefined;
    onChange: (value: TimezoneSetting) => void;
}

const USER_TIMEZONE_TOOLTIP =
    "Each viewer sees data in their own timezone. Falls back to the project timezone if they haven't set one.";

const ChartTimezoneSelect: FC<Props> = ({ value, onChange, ...rest }) => {
    const projectUuid = useProjectUuid();
    const { data: project } = useProject(projectUuid);
    const projectTimezone = project?.queryTimezone ?? undefined;

    const normalizedValue = toTimezoneSetting(value);

    const localTimezone = dayjs.tz.guess();
    const data = useMemo(
        () => getChartTimezoneSelectData(localTimezone),
        [localTimezone],
    );

    // The closed control shows the compact label; specific zones gain their UTC
    // offset only here, in the open list.
    const getPrimaryLabel = (option: { value: string; label: string }) => {
        if (isTimeZone(option.value)) {
            const offset = getTimezoneLabel(option.value) ?? option.label;
            return option.value === localTimezone
                ? `${offset} - Local`
                : offset;
        }
        return option.label;
    };

    return (
        <Select
            size="xs"
            searchable
            allowDeselect={false}
            data={data}
            value={normalizedValue}
            onChange={(newValue) =>
                onChange(toTimezoneSetting(newValue ?? undefined))
            }
            comboboxProps={{ width: 300, position: 'bottom-start' }}
            classNames={{ option: classes.option }}
            renderOption={({ option, checked }) => (
                <Group gap={6} wrap="nowrap" w="100%">
                    <CheckIcon
                        size={11}
                        style={{
                            flexShrink: 0,
                            visibility: checked ? undefined : 'hidden',
                        }}
                    />
                    <span>{getPrimaryLabel(option)}</span>
                    {option.value === PROJECT_TIMEZONE_SETTING &&
                    projectTimezone ? (
                        <Text span size="xs" c="dimmed">
                            {projectTimezone.replaceAll('_', ' ')}
                        </Text>
                    ) : null}
                    {option.value === USER_TIMEZONE_SETTING ? (
                        <Tooltip
                            multiline
                            w={260}
                            withinPortal
                            label={USER_TIMEZONE_TOOLTIP}
                        >
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="ldGray.6"
                                size={14}
                            />
                        </Tooltip>
                    ) : null}
                </Group>
            )}
            {...rest}
        />
    );
};

export default ChartTimezoneSelect;
