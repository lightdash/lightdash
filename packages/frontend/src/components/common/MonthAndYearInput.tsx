import { HTMLSelect } from '@blueprintjs/core';
import moment from 'moment';
import React, { FC } from 'react';
import YearInput from './YearInput';

type Props = {
    value: Date;
    onChange: (value: Date) => void;
    disabled?: boolean;
};

const months = moment.months();

const MonthAndYearInput: FC<Props> = ({ value, onChange, disabled }) => {
    //Filtering a dimension returns a date, but filtering on a table returns a string on UTC
    const utcMonthValue =
        value instanceof Date
            ? moment(value).month()
            : moment(value).utc().month();
    return (
        <>
            <HTMLSelect
                className={disabled ? 'disabled-filter' : ''}
                disabled={disabled}
                fill={false}
                style={{ width: 150 }}
                onChange={(e) =>
                    onChange(
                        moment(value).month(e.currentTarget.value).toDate(),
                    )
                }
                options={months.map((label, index) => ({
                    value: index,
                    label,
                }))}
                value={utcMonthValue}
            />
            <YearInput disabled={disabled} value={value} onChange={onChange} />
        </>
    );
};

export default MonthAndYearInput;
