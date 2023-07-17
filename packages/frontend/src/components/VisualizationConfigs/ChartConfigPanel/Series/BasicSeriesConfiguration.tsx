import { Icon } from '@blueprintjs/core';
import {
    CartesianChartLayout,
    Field,
    getItemLabelWithoutTableName,
    getSeriesId,
    Series,
    TableCalculation,
} from '@lightdash/common';
import React, { FC } from 'react';
import { DraggableProvidedDragHandleProps } from 'react-beautiful-dnd';
import { SeriesBlock, SeriesTitle } from './Series.styles';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    isSingle: boolean;
    layout?: CartesianChartLayout;
    series: Series;
    item: Field | TableCalculation;
    getSeriesColor: (key: string) => string | undefined;
    updateSingleSeries: (series: Series) => void;
    dragHandleProps?: DraggableProvidedDragHandleProps;
};

const BasicSeriesConfiguration: FC<BasicSeriesConfigurationProps> = ({
    isSingle,
    layout,
    series,
    item,
    getSeriesColor,
    updateSingleSeries,
    dragHandleProps,
}) => {
    return (
        <SeriesBlock>
            <SeriesTitle>
                <Icon
                    tagName="div"
                    icon="drag-handle-vertical"
                    {...dragHandleProps}
                />
                {getItemLabelWithoutTableName(item)}
            </SeriesTitle>
            <SingleSeriesConfiguration
                layout={layout}
                series={series}
                isSingle={isSingle}
                seriesLabel={getItemLabelWithoutTableName(item)}
                fallbackColor={getSeriesColor(getSeriesId(series))}
                updateSingleSeries={updateSingleSeries}
            />
        </SeriesBlock>
    );
};

export default BasicSeriesConfiguration;
