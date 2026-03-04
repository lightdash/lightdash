import { getItemId, type CompactOrAlias } from '@lightdash/common';
import { ActionIcon, Group, Select, Tooltip } from '@mantine-8/core';
import {
    IconEye,
    IconEyeOff,
    IconTable,
    IconTableOff,
} from '@tabler/icons-react';
import { type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { StyleOptions } from './common';
import { LabelEditor } from './LabelEditor';

export const Layout: FC = () => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isBigNumberVisualizationConfig(visualizationConfig)) return null;

    const {
        bigNumberLabel,
        defaultLabel,
        setBigNumberLabel,
        bigNumberStyle,
        setBigNumberStyle,
        setBigNumberComparisonStyle,
        showStyle,
        selectedField: selectedFieldId,
        setSelectedField,
        getField,
        showBigNumberLabel,
        setShowBigNumberLabel,
        showTableNamesInLabel,
        setShowTableNamesInLabel,
        granularityFields,
    } = visualizationConfig.chartConfig;

    const selectedField = getField(selectedFieldId);

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
                            if (!newValue) {
                                setBigNumberStyle(undefined);
                                setBigNumberComparisonStyle(undefined);
                            } else {
                                setBigNumberStyle(newValue as CompactOrAlias);
                                setBigNumberComparisonStyle(
                                    newValue as CompactOrAlias,
                                );
                            }
                        }}
                    />
                )}

                <Group gap="xs" align="flex-start" wrap="nowrap">
                    <div style={{ flex: 1 }}>
                        <LabelEditor
                            label="Label"
                            value={bigNumberLabel ?? ''}
                            placeholder={defaultLabel}
                            onChange={setBigNumberLabel}
                            fields={granularityFields ?? []}
                            readOnly={!showBigNumberLabel}
                        />
                    </div>

                    <Group gap={4} wrap="nowrap" mt={25}>
                        <Tooltip
                            withinPortal
                            label={
                                bigNumberLabel
                                    ? 'Clear custom label to toggle table names'
                                    : showTableNamesInLabel
                                      ? 'Hide table names in label'
                                      : 'Show table names in label'
                            }
                        >
                            <ActionIcon
                                variant="subtle"
                                onClick={() => {
                                    if (!bigNumberLabel) {
                                        setShowTableNamesInLabel(
                                            !showTableNamesInLabel,
                                        );
                                    }
                                }}
                                disabled={!!bigNumberLabel}
                                style={{
                                    cursor: bigNumberLabel
                                        ? 'not-allowed'
                                        : 'pointer',
                                }}
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
                        <ActionIcon
                            variant="subtle"
                            onClick={() => {
                                setShowBigNumberLabel(!showBigNumberLabel);
                            }}
                        >
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
