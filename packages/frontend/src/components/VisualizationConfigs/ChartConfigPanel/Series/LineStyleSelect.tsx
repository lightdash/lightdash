import { type SeriesLineStyle } from '@lightdash/common';
import { Select } from '@mantine/core';
import { type FC } from 'react';

const LINE_STYLE_OPTIONS = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];

type Props = {
    label?: string;
    value?: SeriesLineStyle | 'mixed';
    onChange: (value: SeriesLineStyle) => void;
};

export const LineStyleSelect: FC<Props> = ({ label, value, onChange }) => (
    <Select
        allowDeselect={false}
        label={label}
        value={value ?? 'solid'}
        data={
            value === 'mixed'
                ? [
                      ...LINE_STYLE_OPTIONS,
                      { value: 'mixed', label: 'Mixed', disabled: true },
                  ]
                : LINE_STYLE_OPTIONS
        }
        onChange={(newValue) => {
            if (
                newValue === 'solid' ||
                newValue === 'dashed' ||
                newValue === 'dotted'
            ) {
                onChange(newValue);
            }
        }}
    />
);
