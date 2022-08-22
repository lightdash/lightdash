import { HTMLSelect } from '@blueprintjs/core';
import moment from 'moment';
import { FC } from 'react';
import YearInput from './YearInput';

type Props = {
    value: Date;
    onChange: (value: Date) => void;
};

const months = moment.months();

const MonthAndYearInput: FC<Props> = ({ value, onChange }) => (
    <>
        <HTMLSelect
            fill={false}
            style={{ width: 150 }}
            onChange={(e) =>
                onChange(moment(value).month(e.currentTarget.value).toDate())
            }
            options={months.map((label, index) => ({ value: index, label }))}
            value={moment(value).month()}
        />
        <YearInput value={value} onChange={onChange} />
    </>
);

export default MonthAndYearInput;
