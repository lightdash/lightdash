import { Group, Select } from '@mantine/core';
import moment from 'moment';
import { FC } from 'react';
import YearInput from './YearInput';

type Props = {
    value: Date;
    onChange: (value: Date) => void;
    disabled?: boolean;
};

const months = moment.months();

const MonthAndYearInput: FC<Props> = ({ value, onChange, disabled }) => {
    const monthName = moment(value).format('MMMM');

    return (
        <Group grow sx={{ flex: 1 }}>
            <Select
                disabled={disabled}
                onChange={(month) => {
                    if (month) onChange(moment(value).month(month).toDate());
                }}
                data={months.map((month) => ({
                    value: month,
                    label: month,
                }))}
                value={monthName}
            />

            <YearInput disabled={disabled} value={value} onChange={onChange} />
        </Group>
    );
};

export default MonthAndYearInput;
