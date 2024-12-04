import { TimeFrames, type TimeDimensionConfig } from '@lightdash/common';
import { Select, useMantineTheme } from '@mantine/core';
import { type FC } from 'react';
import { usePillSelectStyles } from '../../../../components/DataViz/hooks/usePillSelectStyles';

type Props = {
    dimension: TimeDimensionConfig;
    onChange: (timeDimensionOverride: TimeDimensionConfig) => void;
};

export const TimeDimensionIntervalPicker: FC<Props> = ({
    dimension,
    onChange,
}) => {
    const theme = useMantineTheme();
    const { classes } = usePillSelectStyles({
        backgroundColor: theme.colors.indigo[0],
        textColor: theme.colors.indigo[4],
    });
    return (
        <Select
            data={[
                {
                    value: TimeFrames.DAY,
                    label: 'Day',
                },
                {
                    value: TimeFrames.WEEK,
                    label: 'Week',
                },
                {
                    value: TimeFrames.MONTH,
                    label: 'Month',
                },
                {
                    value: TimeFrames.YEAR,
                    label: 'Year',
                },
            ]}
            value={dimension?.interval}
            onClick={(event) => {
                event.stopPropagation();
            }}
            onChange={(value: TimeFrames) => {
                if (!value) return;
                onChange({
                    interval: value,
                    field: dimension.field,
                    table: dimension.table,
                });
            }}
            withinPortal
            classNames={{
                item: classes.item,
                dropdown: classes.dropdown,
                input: classes.input,
                rightSection: classes.rightSection,
            }}
            styles={{
                root: {
                    fontWeight: 500,
                    fontSize: theme.fontSizes.xs,
                },
                input: {
                    width: '50px',
                },
            }}
        />
    );
};
