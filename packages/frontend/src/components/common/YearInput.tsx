import { NumericInput } from '@blueprintjs/core';
import moment from 'moment';
import React, { FC } from 'react';

type Props = {
    value: Date;
    onChange: (value: Date) => void;
};

const YearInput: FC<Props> = ({ value, onChange }) => {
    return (
        <NumericInput
            fill
            max={9999}
            min={1000}
            minLength={4}
            maxLength={4}
            defaultValue={moment(value).utc().year()}
            onValueChange={(year) => {
                if (year > 1000 && year < 9999) {
                    onChange(moment(value).utc().year(year).toDate());
                }
            }}
            onBlur={(e) => {
                let year = parseInt(e.currentTarget.value, 10);
                if (year < 1000) {
                    year = 1000;
                } else if (year > 9999) {
                    year = 9999;
                }
                onChange(moment(value).utc().year(year).toDate());
            }}
        />
    );
};

export default YearInput;
