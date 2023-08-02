import { HTMLSelect, HTMLSelectProps } from '@blueprintjs/core';
import moment from 'moment';
import { FC } from 'react';
import YearInput from './YearInput';

type Props = {
    value: Date;
    onChange: (value: Date) => void;
    isRuleDisabled?: boolean;
} & Pick<HTMLSelectProps, 'disabled' | 'placeholder'>;

const months = moment.months();

const MonthAndYearInput: FC<Props> = ({
    value,
    onChange,
    disabled,
    placeholder,
    isRuleDisabled,
}) => {
    const utcMonthValue = moment(value).month();
    return (
        <>
            {isRuleDisabled ? null : (
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
            )}
            <YearInput
                placeholder={placeholder}
                disabled={disabled}
                value={isRuleDisabled ? null : value}
                onChange={onChange}
            />
        </>
    );
};

export default MonthAndYearInput;
