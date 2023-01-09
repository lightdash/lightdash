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
    Series,
    TableCalculation,
} from '@lightdash/common';
import debounce from 'lodash/debounce';
import { FC, useCallback, useMemo, useState } from 'react';
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

    const selectedReferenceLines: MarkLine[] | undefined = useMemo(() => {
        return dirtyEchartsConfig?.series
            ?.filter((serie) => serie.markLine !== undefined)
            .map((serie) => serie.markLine!);
    }, [dirtyEchartsConfig?.series]);
    const [referenceLines, setReferenceLines] = useState<
        MarkLine[] | undefined
    >(selectedReferenceLines);

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
                        dirtyLayout?.xField === fieldId ? 'xAxis' : 'yAxis';

                    const existingData = selectedSeries.markLine?.data || [];
                    //const appendData =
                    const updatedSeries: Series = {
                        ...selectedSeries,
                        markLine: {
                            symbol: 'none',
                            lineStyle: {
                                color: updateColor,
                                width: 3,
                                type: 'solid',
                            },
                            label: updateLabel
                                ? { formatter: updateLabel }
                                : {},
                            data: [...existingData, { [axis]: updateValue }],
                        },
                    };
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
        [updateSingleSeries, dirtyEchartsConfig?.series, dirtyLayout?.xField],
    );
    const removeMarkLine = useCallback(() => {
        if (!dirtyEchartsConfig?.series) return;
        const series = dirtyEchartsConfig?.series.map((serie) => ({
            ...serie,
            markLine: undefined,
        }));
        updateSeries(series);
    }, [updateSeries, dirtyEchartsConfig?.series]);

    const addMarkline = useCallback(() => {
        const newReferenceLine = {
            symbol: 'none',
            data: [],
            lineStyle: {
                color: '#000',
                width: 3,
                type: 'solid',
            },
            label: {
                formatter: undefined,
            },
        };
        if (referenceLines !== undefined)
            setReferenceLines([...referenceLines, newReferenceLine]);
        else setReferenceLines([newReferenceLine]);
    }, [updateSeries, dirtyEchartsConfig?.series, referenceLines]);

    return (
        <>
            <Checkbox
                name="show"
                onChange={() => {
                    if (isOpen) removeMarkLine();
                    //  else updateMarkLine(value, selectedField, label, lineColor);
                    setIsOpen(!isOpen);
                }}
                checked={isOpen}
            >
                Include reference line
            </Checkbox>
            <Collapse isOpen={isOpen}>
                {referenceLines &&
                    referenceLines.map((markLine, index) => {
                        return (
                            <ReferenceLine
                                key={index}
                                items={items}
                                markLine={markLine}
                                index={index + 1}
                                updateReferenceLine={updateReferenceLine}
                            />
                        );
                    })}
                <Button minimal onClick={addMarkline}>
                    + Add
                </Button>
            </Collapse>
        </>
    );
};
