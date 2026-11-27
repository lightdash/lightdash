import {
    CartesianChartDataModel,
    CustomFormatType,
    NumberSeparator,
    type CartesianChartDisplay,
    type CustomFormat,
} from '@lightdash/common';
import { useCallback, useMemo, type FC } from 'react';
import { type ValueOf } from 'type-fest';
import { FormatForm } from '../../Explorer/FormatForm';

type Props = {
    axis: NonNullable<CartesianChartDisplay['yAxis']>[number] | undefined;
    onChangeFormatOption: (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => void;
};

export const CartesianChartFormatConfig: FC<Props> = ({
    axis,
    onChangeFormatOption,
}) => {
    const format = useMemo<CustomFormat>(
        () => ({
            type: CustomFormatType.DEFAULT,
            separator: NumberSeparator.DEFAULT,
            ...CartesianChartDataModel.getAxisFormat(axis),
        }),
        [axis],
    );

    const formatInputProps = useCallback(
        (path: keyof CustomFormat) => ({
            value: format[path],
            onChange: (value: ValueOf<CustomFormat>) =>
                onChangeFormatOption(path, value),
        }),
        [format, onChangeFormatOption],
    );

    return (
        <FormatForm
            compact
            format={format}
            formatInputProps={formatInputProps}
            setFormatFieldValue={onChangeFormatOption}
        />
    );
};
