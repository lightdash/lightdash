import React, { FC } from 'react';
import Select2 from '../../../ReactHookForm/Select2';

const defaultOption = { value: null, label: 'Auto' };
const daysOfWeekOptions = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
].map((x, index) => ({ value: index, label: x }));

const StartOfWeekSelect: FC<{ disabled: boolean }> = ({ disabled }) => {
    return (
        <Select2
            name="warehouse.startOfWeek"
            label="Start of week"
            labelHelp="Will be taken into account when using 'WEEK' time interval"
            items={[defaultOption, ...daysOfWeekOptions]}
            defaultValue={defaultOption.value}
            disabled={disabled}
        />
    );
};

export default StartOfWeekSelect;
