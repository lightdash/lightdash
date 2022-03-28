import { Colors } from '@blueprintjs/core';
import {
    CartesianChartLayout,
    Field,
    getItemId,
    getItemLabel,
    getSeriesId,
    Series,
    TableCalculation,
} from 'common';
import React, { FC } from 'react';
import { SeriesBlock, SeriesTitle } from './Series.styles';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    layout?: CartesianChartLayout;
    series?: Series[];
    items: Array<Field | TableCalculation>;
    getSeriesColor: (key: string) => string | undefined;
    updateSingleSeries: (series: Series) => void;
};

const BasicSeriesConfiguration: FC<BasicSeriesConfigurationProps> = ({
    layout,
    series: allSeries,
    items,
    getSeriesColor,
    updateSingleSeries,
}) => {
    return (
        <>
            {allSeries?.map((series) => {
                const field = items.find(
                    (item) => getItemId(item) === series.encode.yRef.field,
                );
                if (!field) {
                    return (
                        <SeriesBlock>
                            <span
                                style={{
                                    width: '100%',
                                    color: Colors.GRAY1,
                                }}
                            >
                                Tried to reference field with unknown id:{' '}
                                {series.encode.yRef.field}
                            </span>
                        </SeriesBlock>
                    );
                }
                return (
                    <SeriesBlock key={getSeriesId(series)}>
                        <SeriesTitle>{getItemLabel(field)}</SeriesTitle>
                        <SingleSeriesConfiguration
                            layout={layout}
                            series={series}
                            placeholderName={getItemLabel(field)}
                            fallbackColor={getSeriesColor(getSeriesId(series))}
                            updateSingleSeries={updateSingleSeries}
                        />
                    </SeriesBlock>
                );
            })}
        </>
    );
};

export default BasicSeriesConfiguration;
