import { Alert, Select, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
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
    return (
        <>
            <Select
                name="warehouse.startOfWeek"
                clearable
                placeholder="Auto"
                label="Start of week"
                description="Will be taken into account when using 'WEEK' time interval"
                data={daysOfWeekOptions}
                value={field.value?.toString()}
                onChange={(value) =>
                    field.onChange(value ? parseInt(value) : null)
                }
                disabled={disabled}
                dropdownPosition="top"
            />
            {isRedeployRequired && parseInt(field.value) >= 0 && (
                <Alert
                    icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                    title="Required CLI option"
                    color="blue"
                >
                    Going forward, if you use the CLI to deploy the project, you
                    will need to run the deploy command with the option{' '}
                    <Text fw={500}>
                        <code>--start-of-week={field.value}</code>
                    </Text>
                    , for the changes to take effect.
                </Alert>
            )}
        </>
    );
};

export default StartOfWeekSelect;
