import { getItemId } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import { isSankeyVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../common/FieldSelect';
import { Config } from '../common/Config';

export const SankeyFieldsConfig: FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isSankeyVisualizationConfig(visualizationConfig)) {
        return null;
    }

    const {
        chartConfig: {
            sourceFieldId,
            setSourceFieldId,
            targetFieldId,
            setTargetFieldId,
            valueFieldId,
            setValueFieldId,
            getField,
        },
        allFields,
    } = visualizationConfig;

    const sourceField = getField(sourceFieldId);
    const targetField = getField(targetFieldId);
    const valueField = getField(valueFieldId);
    const fieldsList = Object.values(allFields);

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Fields</Config.Heading>
                <Stack spacing="sm">
                    <FieldSelect
                        label="Source field"
                        description="The field representing the source node"
                        item={sourceField ?? undefined}
                        items={fieldsList.filter(
                            (field) =>
                                field.name !== targetField?.name &&
                                field.name !== valueField?.name,
                        )}
                        onChange={(newValue) => {
                            setSourceFieldId(
                                newValue ? getItemId(newValue) : null,
                            );
                        }}
                        hasGrouping
                    />
                    <FieldSelect
                        label="Target field"
                        description="The field representing the target node"
                        item={targetField ?? undefined}
                        items={fieldsList.filter(
                            (field) =>
                                field.name !== sourceField?.name &&
                                field.name !== valueField?.name,
                        )}
                        onChange={(newValue) => {
                            setTargetFieldId(
                                newValue ? getItemId(newValue) : null,
                            );
                        }}
                        hasGrouping
                    />
                    <FieldSelect
                        label="Value field"
                        description="The field representing the flow weight"
                        item={valueField ?? undefined}
                        items={fieldsList.filter(
                            (field) =>
                                field.name !== sourceField?.name &&
                                field.name !== targetField?.name,
                        )}
                        onChange={(newValue) => {
                            setValueFieldId(
                                newValue ? getItemId(newValue) : null,
                            );
                        }}
                        hasGrouping
                    />
                </Stack>
            </Config.Section>
        </Config>
    );
});
