import { Select } from '@mantine/core';
import capitalize from 'lodash/capitalize';
import { type FC, type ReactNode } from 'react';
import FilterNumberInput from '../../common/Filters/FilterInputs/FilterNumberInput';
import { Config } from './Config';

enum RangeValue {
    CUSTOM = 'custom',
    AUTO = 'auto',
}

type Props = {
    bound: 'min' | 'max';
    value: number | 'auto';
    /** Label of the automatic choice, e.g. "Min value in table". */
    autoLabel: string;
    leftSection?: ReactNode;
    onChange: (value: number | 'auto') => void;
};

/** An automatic-or-custom bound: a type select followed by its number input. */
const RangeBoundInput: FC<Props> = ({
    bound,
    value,
    autoLabel,
    leftSection,
    onChange,
}) => (
    <>
        <Select
            allowDeselect={false}
            style={{ flexBasis: '100%' }}
            label={`${capitalize(bound)} value type`}
            data={Object.values(RangeValue).map((rangeValue) => ({
                value: rangeValue,
                label: rangeValue === RangeValue.AUTO ? autoLabel : `Custom`,
            }))}
            value={value === 'auto' ? RangeValue.AUTO : RangeValue.CUSTOM}
            onChange={(next) => {
                if (next === RangeValue.AUTO) {
                    onChange('auto');
                } else {
                    onChange(0);
                }
            }}
        />

        {/* FIXME: replace with the shared NumberInput component */}
        <FilterNumberInput
            flex="0 1 auto"
            disabled={value === 'auto'}
            placeholder={value === 'auto' ? 'Auto' : undefined}
            label={<Config.Label>{capitalize(bound)} value</Config.Label>}
            leftSection={leftSection}
            value={value}
            onChange={(newValue) => {
                if (newValue === null) return;
                onChange(newValue);
            }}
        />
    </>
);

export default RangeBoundInput;
