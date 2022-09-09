import { Icon } from '@blueprintjs/core';
import {
    CartesianChartLayout,
    Field,
    getItemLabel,
    getSeriesId,
    Series,
    TableCalculation,
} from '@lightdash/common';
import React, { forwardRef } from 'react';
import {
    DraggableProvidedDraggableProps,
    DraggableProvidedDragHandleProps,
} from 'react-beautiful-dnd';
import { SeriesBlock, SeriesTitle } from './Series.styles';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    isSingle: boolean;
    layout?: CartesianChartLayout;
    series: Series;
    item: Field | TableCalculation;
    getSeriesColor: (key: string) => string | undefined;
    updateSingleSeries: (series: Series) => void;
    draggableProps: DraggableProvidedDraggableProps;
    dragHandleProps?: DraggableProvidedDragHandleProps;
};

const BasicSeriesConfiguration = forwardRef<
    HTMLDivElement,
    BasicSeriesConfigurationProps
>(
    (
        {
            isSingle,
            layout,
            series,
            item,
            getSeriesColor,
            updateSingleSeries,
            draggableProps,
            dragHandleProps,
        },
        innerRef,
    ) => {
        return (
            <SeriesBlock ref={innerRef} {...draggableProps}>
                <SeriesTitle>
                    <Icon
                        tagName="div"
                        icon="drag-handle-vertical"
                        {...dragHandleProps}
                    />
                    {getItemLabel(item)}
                </SeriesTitle>
                <SingleSeriesConfiguration
                    layout={layout}
                    series={series}
                    isSingle={isSingle}
                    seriesLabel={getItemLabel(item)}
                    fallbackColor={getSeriesColor(getSeriesId(series))}
                    updateSingleSeries={updateSingleSeries}
                />
            </SeriesBlock>
        );
    },
);

export default BasicSeriesConfiguration;
