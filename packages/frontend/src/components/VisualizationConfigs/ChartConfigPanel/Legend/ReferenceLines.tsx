import {
    fieldId as getFieldId,
    isField,
    isNumericItem,
    isTableCalculation,
    type CompiledDimension,
    type CustomDimension,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import { Accordion } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useProject } from '../../../../hooks/useProject';
import { type ReferenceLineField } from '../../../common/ReferenceLine';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { AddButton } from '../../common/AddButton';
import { Config } from '../../common/Config';
import { useControlledAccordion } from '../../common/hooks/useControlledAccordion';
import { ReferenceLine, type ReferenceLineProps } from './ReferenceLine';

type Props = {
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
    projectUuid: string;
};

export const ReferenceLines: FC<Props> = ({ items, projectUuid }) => {
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();

    const { visualizationConfig } = useVisualizationContext();
    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const project = useProject(projectUuid);
    const startOfWeek = useMemo(
        () => project.data?.warehouseConnection?.startOfWeek,
        [project],
    );
    const updateReferenceLine: ReferenceLineProps['updateReferenceLine'] =
        useCallback(
            ({
                value,
                field,
                label,
                lineColor,
                dynamicValue,
                labelPosition,
                lineId,
            }) => {
                if (!isCartesianChart) return;

                const {
                    dirtyEchartsConfig,
                    dirtyLayout,
                    referenceLines,
                    setReferenceLines,
                } = visualizationConfig.chartConfig;

                if (field) {
                    const fieldId = isField(field)
                        ? getFieldId(field)
                        : field.name;

                    const isNumericField =
                        field &&
                        (isNumericItem(field) ||
                            // Treat untyped table calculations as numeric
                            (isTableCalculation(field) && !field.type));
                    const useAverage =
                        dynamicValue === 'average' && isNumericField;

                    if (dirtyEchartsConfig?.series) {
                        const selectedSeries = dirtyEchartsConfig?.series.find(
                            (serie: Series) =>
                                (dirtyLayout?.xField === fieldId
                                    ? serie.encode.xRef
                                    : serie.encode.yRef
                                ).field === fieldId,
                        );

                        if (selectedSeries === undefined) return;

                        const dataWithAxis = {
                            name: label,
                            type: useAverage ? 'average' : undefined,
                            uuid: lineId,
                            lineStyle: { color: lineColor },
                            label: {
                                position: labelPosition || 'end',
                                formatter: label
                                    ? `${label}${useAverage ? ': {c}' : ''}`
                                    : undefined,
                            },
                            xAxis:
                                dirtyLayout?.xField === fieldId
                                    ? value || ''
                                    : undefined,
                            yAxis:
                                dirtyLayout?.xField === fieldId
                                    ? undefined
                                    : useAverage
                                    ? undefined
                                    : value || '',
                        };

                        const updatedReferenceLines: ReferenceLineField[] =
                            referenceLines.map((line) => {
                                // Check uuid, .value and .name for backwards compatibility
                                if (
                                    line.data.uuid === lineId ||
                                    line.data.value === lineId ||
                                    line.data.name === lineId
                                )
                                    return {
                                        fieldId: fieldId,
                                        data: dataWithAxis,
                                    };
                                else return line;
                            });

                        setReferenceLines(updatedReferenceLines);
                    }
                }
            },
            [isCartesianChart, visualizationConfig],
        );

    const addReferenceLine = useCallback(() => {
        if (!isCartesianChart) return;

        const { setReferenceLines } = visualizationConfig.chartConfig;

        const newReferenceLine: ReferenceLineField = {
            data: {
                uuid: uuidv4(),
            },
        };
        setReferenceLines((prev) => {
            const newReferenceLines = [...prev, newReferenceLine];
            addNewItem(`${newReferenceLines.length}`);

            return newReferenceLines;
        });
    }, [addNewItem, isCartesianChart, visualizationConfig.chartConfig]);

    const removeReferenceLine = useCallback(
        (markLineId: string) => {
            if (!isCartesianChart) return;

            const {
                dirtyEchartsConfig,
                referenceLines,
                setReferenceLines,
                updateSeries,
            } = visualizationConfig.chartConfig;

            if (!dirtyEchartsConfig?.series) return;
            const series = dirtyEchartsConfig?.series.map((serie) => {
                return {
                    ...serie,
                    markLine: {
                        ...serie.markLine,
                        data:
                            serie.markLine?.data.filter(
                                (data) =>
                                    data.uuid !== markLineId &&
                                    data.value !== markLineId &&
                                    data.name !== markLineId,
                            ) || [],
                    },
                };
            });

            updateSeries(series);

            setReferenceLines(
                referenceLines.filter(
                    (line) =>
                        line.data.uuid !== markLineId &&
                        line.data.value !== markLineId &&
                        line.data.name !== markLineId,
                ),
            );
        },
        [isCartesianChart, visualizationConfig],
    );

    if (!isCartesianChart) return null;

    const { referenceLines } = visualizationConfig.chartConfig;

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Reference lines</Config.Heading>
                    <AddButton onClick={addReferenceLine} />
                </Config.Group>

                {referenceLines && (
                    <Accordion
                        multiple
                        variant="contained"
                        value={openItems}
                        onChange={handleAccordionChange}
                        styles={(theme) => ({
                            control: {
                                padding: theme.spacing.xs,
                            },
                            label: {
                                padding: 0,
                            },
                            panel: {
                                padding: 0,
                            },
                        })}
                    >
                        {referenceLines.map((line, index) => (
                            <ReferenceLine
                                isOpen={openItems.includes(`${index + 1}`)}
                                addNewItem={addNewItem}
                                removeItem={removeItem}
                                key={line.data.uuid}
                                index={index + 1}
                                isDefaultOpen={referenceLines.length <= 1}
                                items={items}
                                startOfWeek={startOfWeek ?? undefined}
                                referenceLine={line}
                                updateReferenceLine={updateReferenceLine}
                                removeReferenceLine={removeReferenceLine}
                                data-testid={line.data.uuid}
                            />
                        ))}
                    </Accordion>
                )}
            </Config.Section>
        </Config>
    );
};
