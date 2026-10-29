import {
    getItemId,
    isField,
    isNumericItem,
    isTableCalculation,
    type CompiledDimension,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Accordion } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    selectCartesianEditor,
    useVisualizationSelector,
    type VisualizationStoreState,
} from '../../../../features/visualization/store';
import { useCartesianEditorActions } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { useExploreWarehouseConnection } from '../../../../hooks/useExploreWarehouseConnection';
import { useVisualizationInputs } from '../../../LightdashVisualization/useVisualizationContext';
import accordionClasses from '../../common/Accordion.module.css';
import { AddButton } from '../../common/AddButton';
import { Config } from '../../common/Config';
import { useControlledAccordion } from '../../common/hooks/useControlledAccordion';
import { ReferenceLine, type ReferenceLineProps } from './ReferenceLine';

type Props = {
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
    projectUuid: string;
};

const selectReferenceLines = (state: VisualizationStoreState) =>
    selectCartesianEditor(state).referenceLines;

export const ReferenceLines: FC<Props> = ({ items, projectUuid }) => {
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();

    const { resultsData } = useVisualizationInputs();
    const referenceLines = useVisualizationSelector(selectReferenceLines);
    const { addReferenceLine, removeReferenceLine, updateReferenceLine } =
        useCartesianEditorActions();

    const { startOfWeek } = useExploreWarehouseConnection(
        resultsData?.metricQuery?.exploreName ?? null,
        projectUuid,
    );
    const onUpdateReferenceLine: ReferenceLineProps['updateReferenceLine'] =
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
                if (!field) return;
                updateReferenceLine({
                    lineId,
                    fieldId: isField(field) ? getItemId(field) : field.name,
                    // Treat untyped table calculations as numeric
                    isNumericField:
                        isNumericItem(field) ||
                        (isTableCalculation(field) && !field.type),
                    value,
                    label,
                    lineColor,
                    dynamicValue,
                    labelPosition,
                });
            },
            [updateReferenceLine],
        );

    const onAddReferenceLine = useCallback(() => {
        addReferenceLine(uuidv4());
        addNewItem(`${referenceLines.length + 1}`);
    }, [addNewItem, addReferenceLine, referenceLines.length]);

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Reference lines</Config.Heading>
                    <AddButton onClick={onAddReferenceLine} />
                </Config.Group>
                <Accordion
                    multiple
                    variant="contained"
                    transparentActiveItem
                    value={openItems}
                    onChange={handleAccordionChange}
                    className={accordionClasses.containedList}
                    classNames={{
                        control: accordionClasses.containedControl,
                        label: accordionClasses.containedLabel,
                    }}
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
                            updateReferenceLine={onUpdateReferenceLine}
                            removeReferenceLine={removeReferenceLine}
                            data-testid={line.data.uuid}
                        />
                    ))}
                </Accordion>
            </Config.Section>
        </Config>
    );
};
