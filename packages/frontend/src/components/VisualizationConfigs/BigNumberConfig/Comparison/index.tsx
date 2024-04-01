import { ComparisonFormatTypes, type CompactOrAlias } from '@lightdash/common';
import {
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import { startCase } from 'lodash';
import { isBigNumberVisualizationConfig } from '../../../LightdashVisualization/VisualizationBigNumberConfig';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { Config } from '../../common/Config';
import { StyleOptions } from '../common';

export const Comparison = () => {
    const { visualizationConfig } = useVisualizationContext();

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
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Config.Group>
                    <Group spacing="xs" align="center">
                        <Config.Label>Compare to previous row</Config.Label>
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
                                <Config.SubLabel>Compare by</Config.SubLabel>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: ComparisonFormatTypes.RAW,
                                            label: startCase(
                                                ComparisonFormatTypes.RAW,
                                            ),
                                        },
                                        {
                                            value: ComparisonFormatTypes.PERCENTAGE,
                                            label: startCase(
                                                ComparisonFormatTypes.PERCENTAGE,
                                            ),
                                        },
                                    ]}
                                    value={comparisonFormat}
                                    onChange={(e) => {
                                        setComparisonFormat(
                                            e === 'raw'
                                                ? ComparisonFormatTypes.RAW
                                                : ComparisonFormatTypes.PERCENTAGE,
                                        );
                                    }}
                                />
                            </Group>

                            <Switch
                                label="Flip positive color"
                                checked={flipColors}
                                onChange={() => {
                                    setFlipColors(!flipColors);
                                }}
                            />

                            <Group noWrap grow spacing="xs">
                                <TextInput
                                    label="Comparison label"
                                    value={comparisonLabel ?? ''}
                                    placeholder={'Add an optional label'}
                                    onChange={(e) =>
                                        setComparisonLabel(
                                            e.currentTarget.value,
                                        )
                                    }
                                />

                                {showStyle &&
                                    comparisonFormat ===
                                        ComparisonFormatTypes.RAW && (
                                        <Select
                                            label="Format"
                                            data={StyleOptions}
                                            value={
                                                bigNumberComparisonStyle ?? ''
                                            }
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
                            </Group>
                        </>
                    ) : null}
                </Config.Group>
            </Config>
        </Stack>
    );
};
