import { Button, Checkbox, Collapse, Label } from '@blueprintjs/core';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    MarkLineData,
    Series,
    TableCalculation,
} from '@lightdash/common';
import { FC, useCallback, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { SectionTitle } from '../ChartConfigPanel.styles';
import { ReferenceLine } from './ReferenceLine';

type Props = {
    items: (Field | TableCalculation | CompiledDimension)[];
};

export type ReferenceLineField = {
    fieldId?: string;
    data: MarkLineData;
};
export const ReferenceLines: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: {
            dirtyLayout,
            dirtyEchartsConfig,
            updateSeries,
            updateSingleSeries,
            referenceLines,
            setReferenceLines,
        },
    } = useVisualizationContext();

    const updateReferenceLine = useCallback(
        (
            updateValue: string,
            updateField: Field | TableCalculation | CompiledDimension,
            updateLabel: string | undefined,
            updateColor: string,
            lineId: string,
        ) => {
            if (updateValue && updateField) {
                const fieldId = isField(updateField)
                    ? getFieldId(updateField)
                    : updateField.name;

                if (dirtyEchartsConfig?.series) {
                    const selectedSeries = dirtyEchartsConfig?.series.find(
                        (serie: Series) =>
                            (dirtyLayout?.xField === fieldId
                                ? serie.encode.xRef
                                : serie.encode.yRef
                            ).field === fieldId,
                    );
                    if (selectedSeries === undefined) return;

                    const axes =
                        dirtyLayout?.xField === fieldId
                            ? {
                                  [dirtyLayout?.flipAxes === true
                                      ? 'yAxis'
                                      : 'xAxis']: updateValue,
                              }
                            : {
                                  [dirtyLayout?.flipAxes === true
                                      ? 'xAxis'
                                      : 'yAxis']: updateValue,
                              };

                    const newData: MarkLineData = {
                        ...axes,
                        name: lineId,
                        lineStyle: { color: updateColor },
                        label: updateLabel ? { formatter: updateLabel } : {},
                    };

                    const updatedData = [
                        ...(selectedSeries.markLine?.data || []).filter(
                            (data) => data.name !== lineId,
                        ),
                        newData,
                    ];

                    const updatedSeries: Series = {
                        ...selectedSeries,
                        markLine: {
                            symbol: 'none',
                            lineStyle: {
                                color: '#000',
                                width: 3,
                                type: 'solid',
                            },

                            data: updatedData,
                        },
                    };
                    const updatedReferenceLines: ReferenceLineField[] =
                        referenceLines.map((line) => {
                            if (line.data.name === lineId)
                                return { fieldId: fieldId, data: newData };
                            else return line;
                        });

                    setReferenceLines(updatedReferenceLines);
                    updateSingleSeries(updatedSeries);
                }
            }
        },
        [
            updateSingleSeries,
            dirtyEchartsConfig?.series,
            dirtyLayout?.xField,
            referenceLines,
        ],
    );

    const addReferenceLine = useCallback(() => {
        const newReferenceLine: ReferenceLineField = {
            data: {
                name: uuidv4(),
            },
        };
        setReferenceLines([...referenceLines, newReferenceLine]);
    }, [referenceLines]);

    const removeReferenceLine = useCallback(
        (markLineId) => {
            if (!dirtyEchartsConfig?.series) return;
            const series = dirtyEchartsConfig?.series.map((serie) => {
                return {
                    ...serie,
                    markLine: {
                        ...serie.markLine,
                        data:
                            serie.markLine?.data.filter(
                                (data) => data.name !== markLineId,
                            ) || [],
                    },
                };
            });

            updateSeries(series);

            setReferenceLines(
                referenceLines.filter((line) => line.data.name !== markLineId),
            );
        },
        [updateSeries, dirtyEchartsConfig?.series, referenceLines],
    );

    return (
        <>
            <SectionTitle>Reference lines</SectionTitle>
            {referenceLines &&
                referenceLines.map((line, index) => {
                    return (
                        <ReferenceLine
                            key={line.data.name}
                            index={index + 1}
                            isDefaultOpen={referenceLines.length <= 1}
                            items={items}
                            referenceLine={line}
                            updateReferenceLine={updateReferenceLine}
                            removeReferenceLine={removeReferenceLine}
                        />
                    );
                })}
            <Button minimal intent="primary" onClick={addReferenceLine}>
                + Add
            </Button>
        </>
    );
};
