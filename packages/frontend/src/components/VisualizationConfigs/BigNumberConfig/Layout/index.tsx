import { getItemId, type CompactOrAlias } from '@lightdash/common';
import { ActionIcon, Group, Select, TextInput } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldSelect from '../../../common/FieldSelect';
import MantineIcon from '../../../common/MantineIcon';
import { isBigNumberVisualizationConfig } from '../../../LightdashVisualization/VisualizationBigNumberConfig';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { Config } from '../../common/Config';
import { StyleOptions } from '../common';

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
    } = visualizationConfig.chartConfig;

    const selectedField = getField(selectedFieldId);

    return (
        <Config>
            <Config.Group>
                <Config.Label>Field</Config.Label>
                <FieldSelect
                    label="Selected field"
                    item={selectedField}
                    items={Object.values(itemsMap ?? {})}
                    onChange={(newValue) => {
                        setSelectedField(
                            newValue ? getItemId(newValue) : undefined,
                        );
                    }}
                />

                <Group grow>
                    <TextInput
                        label="Label"
                        value={bigNumberLabel}
                        placeholder={defaultLabel}
                        onChange={(e) =>
                            setBigNumberLabel(e.currentTarget.value)
                        }
                        rightSection={
                            <ActionIcon
                                onClick={() => {
                                    setShowBigNumberLabel(!showBigNumberLabel);
                                }}
                            >
                                {showBigNumberLabel ? (
                                    <MantineIcon icon={IconEye} />
                                ) : (
                                    <MantineIcon icon={IconEyeOff} />
                                )}
                            </ActionIcon>
                        }
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
                                    setBigNumberStyle(
                                        newValue as CompactOrAlias,
                                    );
                                    setBigNumberComparisonStyle(
                                        newValue as CompactOrAlias,
                                    );
                                }
                            }}
                        />
                    )}
                </Group>
            </Config.Group>
        </Config>
    );
};
