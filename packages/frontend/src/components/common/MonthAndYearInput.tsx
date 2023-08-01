import { HTMLSelect, HTMLSelectProps } from '@blueprintjs/core';
import moment from 'moment';
import { FC } from 'react';
import YearInput from './YearInput';

type Props = {
    value: Date;
    onChange: (value: Date) => void;
} & Pick<HTMLSelectProps, 'disabled' | 'placeholder'>;

const months = moment.months();

const MonthAndYearInput: FC<Props> = ({
    value,
    onChange,
    disabled,
    placeholder,
}) => {
    const utcMonthValue = moment(value).month();
    return (
        <>
            <HTMLSelect
                className={disabled ? 'disabled-filter' : ''}
                disabled={disabled}
                fill={false}
                style={{ width: 150 }}
                placeholder={placeholder}
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
