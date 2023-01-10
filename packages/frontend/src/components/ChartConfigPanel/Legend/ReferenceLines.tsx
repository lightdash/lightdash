import {
    Button,
    Checkbox,
    Collapse,
    InputGroup,
    Label,
} from '@blueprintjs/core';
import {
    CompiledDimension,
    Field,
    fieldId as getFieldId,
    isField,
    isNumericItem,
    MarkLine,
    MarkLineData,
    Series,
    TableCalculation,
} from '@lightdash/common';
import debounce from 'lodash/debounce';
import { FC, useCallback, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import SeriesColorPicker from '../Series/SeriesColorPicker';
import { GridSettings, SectionTitle } from './Legend.styles';
import { ReferenceLine } from './ReferenceLine';

type Props = {
    items: (Field | TableCalculation | CompiledDimension)[];
};

export const ReferenceLines: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: {
            dirtyLayout,
            dirtyEchartsConfig,
            updateSeries,
            updateSingleSeries,
        },
    } = useVisualizationContext();

    const selectedReferenceLines: MarkLineData[] = useMemo(() => {
        if (dirtyEchartsConfig?.series === undefined) return [];
        return dirtyEchartsConfig.series.reduce<MarkLineData[]>(
            (acc, serie) => {
                const data = serie.markLine?.data;
                if (data !== undefined) return [...acc, ...data];

                return acc;
            },
            [],
        );
        /* .filter((serie) => serie.markLine?.data !== undefined)
            .map((serie) => serie.markLine?.data);
            return data*/
    }, [dirtyEchartsConfig?.series]);

    const [referenceLines, setReferenceLines] = useState<MarkLineData[]>(
        selectedReferenceLines,
    );

    const [isOpen, setIsOpen] = useState<boolean>(
        selectedReferenceLines !== undefined &&
            selectedReferenceLines.length > 0,
    );

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
                    const getSerieFieldId = (serie: Series) => {
                        const axisRef =
                            dirtyLayout?.xField === fieldId
                                ? serie.encode.xRef
                                : serie.encode.yRef;
                        return axisRef.field === fieldId;
                    };
                    const selectedSeries =
                        dirtyEchartsConfig?.series.find(getSerieFieldId);
                    if (selectedSeries === undefined) return;

                    const axis =
                        dirtyLayout?.xField === fieldId
                            ? { xAxis: updateValue }
                            : { yAxis: updateValue };

                    const currentMarkLineData =
                        selectedSeries.markLine?.data || [];

                    const updatedLabel = updateLabel
                        ? { formatter: updateLabel }
                        : {};
                    const newData: MarkLineData = {
                        ...axis,
                        name: lineId,
                        lineStyle: { color: updateColor },
                        label: updatedLabel,
                    };

                    const updatedData = [
                        ...currentMarkLineData.filter(
                            (data) => data.name !== lineId,
                        ),
                        newData,
                    ];

                    //const appendData =
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

                    const updatedReferenceLines: MarkLineData[] =
                        referenceLines.map((line) => {
                            if (line.name === lineId) return newData;
                            else return line;
                        });

                    setReferenceLines(updatedReferenceLines);

                    updateSingleSeries(updatedSeries);
                    /* const series = updatedSeries
                    }
                    const series = dirtyEchartsConfig?.series.map((serie) => {
                        const axisRef =
                            dirtyLayout?.xField === fieldId
                                ? serie.encode.xRef
                                : serie.encode.yRef;
                        if (axisRef.field === fieldId && !alreadyAdded) {
                            alreadyAdded = true;
                            const axis =
                                dirtyLayout?.xField === fieldId
                                    ? 'xAxis'
                                    : 'yAxis';
                            return {
                        } 
                    });
                    updateSeries(series);*/
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
    /* const removeMarkLine = useCallback(() => {
        if (!dirtyEchartsConfig?.series) return;
        const series = dirtyEchartsConfig?.series.map((serie) => ({
            ...serie,
            markLine: undefined,
        }));
        updateSeries(series);
    }, [updateSeries, dirtyEchartsConfig?.series]);
*/
    const referenceLine = useCallback(() => {
        const newReferenceLine: MarkLineData = {
            name: uuidv4(),
            lineStyle: {
                color: '#000',
            },
            label: {},
            /*label: {
                formatter: undefined,
            },*/
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
                referenceLines.filter((line) => line.name !== markLineId),
            );
        },
        [updateSeries, dirtyEchartsConfig?.series, referenceLines],
    );

    return (
        <>
            <Checkbox
                name="show"
                onChange={() => {
                    //if (isOpen) removeMarkLine();
                    //  else updateMarkLine(value, selectedField, label, lineColor);
                    setIsOpen(!isOpen);
                }}
                checked={isOpen}
            >
                Include reference line
            </Checkbox>
            <Collapse isOpen={isOpen}>
                {referenceLines &&
                    referenceLines.map((line, index) => {
                        return (
                            <ReferenceLine
                                key={line.name}
                                index={index + 1}
                                items={items}
                                referenceLine={line}
                                updateReferenceLine={updateReferenceLine}
                                removeReferenceLine={removeReferenceLine}
                            />
                        );
                    })}
                <Button minimal onClick={referenceLine}>
                    + Add
                </Button>
            </Collapse>
        </>
    );
};
