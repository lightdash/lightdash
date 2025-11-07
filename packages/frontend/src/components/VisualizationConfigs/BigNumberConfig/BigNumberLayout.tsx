import { getItemId, type CompactOrAlias } from '@lightdash/common';
import { ActionIcon, Group, Select, TextInput, Tooltip } from '@mantine/core';
import {
    IconEye,
    IconEyeOff,
    IconTable,
    IconTableOff,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { Config } from '../common/Config';
import { StyleOptions } from './common';

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

                <TextInput
                    variant={showBigNumberLabel ? 'default' : 'filled'}
                    label="Label"
                    value={bigNumberLabel}
                    placeholder={defaultLabel}
                    onChange={(e) => setBigNumberLabel(e.currentTarget.value)}
                    readOnly={!showBigNumberLabel}
                    styles={{
                        rightSection: {
                            width: '60px',
                        },
                    }}
                    rightSection={
                        <Group spacing={4} noWrap>
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
                                onClick={() => {
                                    setShowBigNumberLabel(!showBigNumberLabel);
                                }}
                            >
                                <MantineIcon
                                    icon={
                                        showBigNumberLabel
                                            ? IconEye
                                            : IconEyeOff
                                    }
                                />
                            </ActionIcon>
                        </Group>
                    }
                />
            </Config.Section>
        </Config>
    );
};
