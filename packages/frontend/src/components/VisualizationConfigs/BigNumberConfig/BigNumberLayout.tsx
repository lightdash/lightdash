import { getItemId, type CompactOrAlias } from '@lightdash/common';
import { ActionIcon, Box, Group, Select, Tooltip } from '@mantine/core';
import {
    IconEye,
    IconEyeOff,
    IconTable,
    IconTableOff,
} from '@tabler/icons-react';
import { type FC } from 'react';
import {
    selectBigNumberDefaultLabel,
    selectBigNumberEditor,
    selectBigNumberGranularityFields,
    selectBigNumberSelectedField,
    selectBigNumberShowStyle,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useBigNumberEditorActions } from '../../../hooks/useBigNumberConfig';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { LabelEditor } from '../common/LabelEditor';
import { StyleOptions } from './common';

export const Layout: FC = () => {
    const { itemsMap } = useVisualizationInputs();
    const bigNumberLabel = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).bigNumberLabel,
    );
    const bigNumberStyle = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).bigNumberStyle,
    );
    const showBigNumberLabel = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).showBigNumberLabel,
    );
    const showTableNamesInLabel = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).showTableNamesInLabel,
    );
    const selectedFieldId = useVisualizationInputSelector(
        selectBigNumberSelectedField,
    );
    const defaultLabel = useVisualizationInputSelector(
        selectBigNumberDefaultLabel,
    );
    const showStyle = useVisualizationInputSelector(selectBigNumberShowStyle);
    const granularityFields = useVisualizationInputSelector(
        selectBigNumberGranularityFields,
    );
    const {
        setSelectedField,
        setBigNumberLabel,
        styleChange,
        toggleShowBigNumberLabel,
        toggleShowTableNamesInLabel,
    } = useBigNumberEditorActions();

    const selectedField = selectedFieldId
        ? itemsMap?.[selectedFieldId]
        : undefined;

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Field</Config.Heading>
                <FieldSelect
                    label="Selected field"
                    item={selectedField}
                    items={Object.values(itemsMap ?? {})}
                    onChange={(newValue) => {
                        setSelectedField(
                            newValue ? getItemId(newValue) : undefined,
                        );
                    }}
                    hasGrouping
                />

                {showStyle && (
                    <Select
                        label="Format"
                        data={StyleOptions}
                        value={bigNumberStyle ?? ''}
                        onChange={(newValue) => {
                            styleChange(
                                newValue
                                    ? (newValue as CompactOrAlias)
                                    : undefined,
                            );
                        }}
                    />
                )}

                <Group gap="xs" align="flex-start" wrap="nowrap">
                    <Box flex={1}>
                        <LabelEditor
                            label="Label"
                            value={bigNumberLabel ?? ''}
                            placeholder={defaultLabel}
                            onChange={setBigNumberLabel}
                            fields={granularityFields}
                            readOnly={!showBigNumberLabel}
                        />
                    </Box>

                    <Group gap={4} wrap="nowrap" mt={25}>
                        <Tooltip
                            label={
                                bigNumberLabel
                                    ? 'Clear custom label to toggle table names'
                                    : showTableNamesInLabel
                                      ? 'Hide table names in label'
                                      : 'Show table names in label'
                            }
                        >
                            <ActionIcon
                                onClick={() => {
                                    if (!bigNumberLabel) {
                                        toggleShowTableNamesInLabel();
                                    }
                                }}
                                disabled={!!bigNumberLabel}
                            >
                                <MantineIcon
                                    icon={
                                        showTableNamesInLabel
                                            ? IconTable
                                            : IconTableOff
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <ActionIcon onClick={toggleShowBigNumberLabel}>
                            <MantineIcon
                                icon={showBigNumberLabel ? IconEye : IconEyeOff}
                            />
                        </ActionIcon>
                    </Group>
                </Group>
            </Config.Section>
        </Config>
    );
};
