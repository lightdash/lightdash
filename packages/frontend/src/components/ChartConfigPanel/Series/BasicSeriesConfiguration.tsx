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
import { SeriesBlock, SeriesDivider, SeriesTitle } from './Series.styles';
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
    const [openSeriesId, setOpenSeriesId] = React.useState<string | undefined>(
        undefined,
    );
    return (
        <>
            {allSeries?.map((series, i) => {
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

                const hasDivider = allSeries.length !== i + 1;

                return (
                    <SeriesBlock key={getSeriesId(series)}>
                        <SeriesTitle>{getItemLabel(field)}</SeriesTitle>
                        <SingleSeriesConfiguration
                            layout={layout}
                            series={series}
                            isSingle={allSeries.length <= 1}
                            seriesLabel={getItemLabel(field)}
                            fallbackColor={getSeriesColor(getSeriesId(series))}
                            updateSingleSeries={updateSingleSeries}
                            isOpen={openSeriesId === getSeriesId(series)}
                            toggleIsOpen={() =>
                                setOpenSeriesId(
                                    openSeriesId === getSeriesId(series)
                                        ? undefined
                                        : getSeriesId(series),
                                )
                            }
                        />
                        {hasDivider && <SeriesDivider />}
                    </SeriesBlock>
                );
            })}
        </>
    );
};

export default BasicSeriesConfiguration;
