import { DbtProjectType, FeatureFlags } from '@lightdash/common';
import { Alert, Text, Select } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';

const daysOfWeekOptions = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
].map((x, index) => ({ value: index.toString(), label: x }));

const StartOfWeekSelect: FC<{
    disabled: boolean;
    isRedeployRequired?: boolean;
}> = ({ disabled, isRedeployRequired = true }) => {
    const form = useFormContext();
    const field = form.getInputProps('warehouse.startOfWeek');
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const isTimezoneSupportEnabled = timezoneSupportFlag?.enabled ?? true;
    const isCliDeployed = form.values.dbt?.type === DbtProjectType.NONE;
    const isDaySelected = field.value !== null && field.value !== undefined;
    const dayName = daysOfWeekOptions.find(
        (option) => option.value === field.value?.toString(),
    )?.label;

    return (
        <>
            <Select
                name="warehouse.startOfWeek"
                clearable
                placeholder="Auto"
                label="Start of week"
                description="Sets the first day of the week for week time intervals."
                data={daysOfWeekOptions}
                value={field.value?.toString()}
                onChange={(value) =>
                    field.onChange(value ? parseInt(value) : null)
                }
                disabled={disabled}
                comboboxProps={{
                    position: 'top',
                    middlewares: { flip: false },
                }}
            />
            {isRedeployRequired && isCliDeployed && isDaySelected && (
                <Alert
                    icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                    title={
                        isTimezoneSupportEnabled
                            ? 'Date columns need a deploy'
                            : 'Required CLI option'
                    }
                    color="blue"
                >
                    {isTimezoneSupportEnabled ? (
                        <>
                            Your choice applies right away to week dimensions
                            built on a timestamp column. Dimensions built on a
                            date column keep the day they were compiled with, so
                            run{' '}
                            <Text fw={500} span>
                                <code>{`lightdash deploy --start-of-week=${field.value}`}</code>
                            </Text>{' '}
                            ({dayName}) to update those.
                        </>
                    ) : (
                        <>
                            Going forward, if you use the CLI to deploy the
                            project, you will need to run the deploy command
                            with the option{' '}
                            <Text fw={500} span>
                                <code>--start-of-week={field.value}</code>
                            </Text>
                            , for the changes to take effect.
                        </>
                    )}
                </Alert>
            )}
        </>
    );
};

export default StartOfWeekSelect;
