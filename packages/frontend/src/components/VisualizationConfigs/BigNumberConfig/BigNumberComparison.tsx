import {
    ComparisonFormatTypes,
    getItemId,
    type CompactOrAlias,
} from '@lightdash/common';
import {
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import startCase from 'lodash/startCase';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../common/FieldSelect';
import { Config } from '../common/Config';
import { StyleOptions } from './common';

export const Comparison: React.FC = () => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isBigNumberVisualizationConfig(visualizationConfig)) return null;

    const {
        bigNumberComparisonStyle,
        setBigNumberComparisonStyle,
        showStyle,
        showComparison,
        setShowComparison,
        comparisonFormat,
        setComparisonFormat,
        flipColors,
        setFlipColors,
        comparisonLabel,
        setComparisonLabel,
        selectedField,
        getField,
        comparisonField,
        setComparisonField,
    } = visualizationConfig.chartConfig;

    const comparisonFieldItem = getField(comparisonField);

    // Filter out selectedField from available comparison fields
    const comparisonFieldItems = Object.values(itemsMap ?? {}).filter(
        (item) => getItemId(item) !== selectedField,
    );

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group spacing="xs" align="center">
                        <Config.Heading>Show comparison</Config.Heading>
                        <Switch
                            checked={showComparison}
                            onChange={() => {
                                setShowComparison(!showComparison);
                            }}
                        />
                    </Group>

                    {showComparison ? (
                        <>
                            <Group spacing="xs">
                                <Config.Label>Compare by</Config.Label>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: ComparisonFormatTypes.RAW,
                                            label: `${startCase(
                                                ComparisonFormatTypes.RAW,
                                            )} value`,
                                        },
                                        {
                                            value: ComparisonFormatTypes.PERCENTAGE,
                                            label: startCase(
                                                ComparisonFormatTypes.PERCENTAGE,
                                            ),
                                        },
                                        {
                                            value: ComparisonFormatTypes.VALUE,
                                            label: 'Value',
                                        },
                                    ]}
                                    value={comparisonFormat}
                                    onChange={(e) => {
                                        setComparisonFormat(
                                            e as ComparisonFormatTypes,
                                        );
                                    }}
                                />
                            </Group>

                            {comparisonFormat ===
                                ComparisonFormatTypes.VALUE && (
                                <FieldSelect
                                    label="Comparison field"
                                    item={comparisonFieldItem}
                                    items={comparisonFieldItems}
                                    onChange={(newValue) => {
                                        setComparisonField(
                                            newValue
                                                ? getItemId(newValue)
                                                : undefined,
                                        );
                                    }}
                                    hasGrouping
                                />
                            )}

                            {comparisonFormat !==
                                ComparisonFormatTypes.VALUE && (
                                <Switch
                                    label="Flip positive color"
                                    checked={flipColors}
                                    onChange={() => {
                                        setFlipColors(!flipColors);
                                    }}
                                    labelPosition="left"
                                    styles={{
                                        label: {
                                            paddingLeft: 0,
                                        },
                                    }}
                                />
                            )}

                            {showStyle &&
                                comparisonFormat ===
                                    ComparisonFormatTypes.RAW && (
                                    <Select
                                        label="Format"
                                        data={StyleOptions}
                                        value={bigNumberComparisonStyle ?? ''}
                                        onChange={(newValue) => {
                                            if (!newValue) {
                                                setBigNumberComparisonStyle(
                                                    undefined,
                                                );
                                            } else {
                                                setBigNumberComparisonStyle(
                                                    newValue as CompactOrAlias,
                                                );
                                            }
                                        }}
                                    />
                                )}

                            <TextInput
                                label="Comparison label"
                                value={comparisonLabel ?? ''}
                                placeholder={'Add an optional label'}
                                onChange={(e) =>
                                    setComparisonLabel(e.currentTarget.value)
                                }
                            />
                        </>
                    ) : null}
                </Config.Section>
            </Config>
        </Stack>
    );
};
