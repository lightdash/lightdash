import {
    type CompiledDimension,
    type CustomDimension,
    type EchartsLegend,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    SegmentedControl,
    Stack,
    Switch,
} from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { useToggle } from 'react-use';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { UnitInputsGrid } from '../common/UnitInputsGrid';
import { ReferenceLines } from './ReferenceLines';
import { TooltipConfig } from './TooltipConfig';

enum Positions {
    Left = 'left',
    Right = 'right',
    Top = 'top',
    Bottom = 'bottom',
}

type MarginConfigurationProps = {
    legendConfig: EchartsLegend;
    handleChange: (prop: string, newValue: string | undefined) => void;
};

const PositionConfiguration: FC<MarginConfigurationProps> = ({
    legendConfig,
    handleChange,
}) => {
    const hasPositionConfigChanged = (
        config: MarginConfigurationProps['legendConfig'],
    ) => {
        const positionValues = Object.values(Positions);

        return Object.keys(config).some((key) =>
            positionValues.includes(key as Positions),
        );
    };

    const [isAutoPosition, toggleAuto] = useToggle(
        !hasPositionConfigChanged(legendConfig),
    );

    const defaultConfig = {
        top: 'auto',
        left: 'auto',
        right: 'auto',
        bottom: 'auto',
    };

    return (
        <Config>
            <Config.Section>
                <Switch
                    labelPosition="left"
                    label={`Custom position`}
                    checked={!isAutoPosition}
                    onChange={toggleAuto}
                    styles={{
                        label: {
                            paddingLeft: 0,
                        },
                    }}
                />

                {!isAutoPosition && (
                    <UnitInputsGrid
                        centerLabel="Position"
                        config={legendConfig}
                        onChange={(position, newValue) =>
                            handleChange(position, newValue)
                        }
                        defaultConfig={defaultConfig}
                    />
                )}
            </Config.Section>
        </Config>
    );
};

type Props = {
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
};

export const Legend: FC<Props> = ({ items }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { visualizationConfig } = useVisualizationContext();

    // Extract fields used in the chart config, including pivot values
    // At the moment we only support fields that are part of the chart config
    const fieldsUsedInChartConfig = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return [];
        const { dirtyEchartsConfig: echartsConfig } =
            visualizationConfig.chartConfig;

        const allEncodes: Series['encode'][] =
            echartsConfig?.series?.map((serie) => serie.encode) ?? [];
        const fieldSet = allEncodes.reduce<Set<string>>((acc, encode) => {
            acc.add(encode.xRef.field);
            if (encode.yRef.pivotValues !== undefined) {
                const pivotValue = encode.yRef.pivotValues[0];
                acc.add(
                    `${encode.yRef.field}.${pivotValue.field}.${pivotValue.value}`,
                );
            }
            return acc;
        }, new Set<string>());

        return [...fieldSet];
    }, [visualizationConfig]);

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { dirtyEchartsConfig, setLegend } = visualizationConfig.chartConfig;

    const legendConfig = dirtyEchartsConfig?.legend ?? {};

    const handleChange = (
        prop: string,
        newValue: string | boolean | undefined,
    ) => {
        const newState = { ...legendConfig, [prop]: newValue };
        setLegend(newState);
        return newState;
    };

    const showDefault = (dirtyEchartsConfig?.series || []).length > 1;
    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group spacing="xs" align="center">
                        <Config.Heading>Legend</Config.Heading>
                        <Switch
                            checked={legendConfig.show ?? showDefault}
                            onChange={(e) =>
                                handleChange('show', e.currentTarget.checked)
                            }
                        />
                    </Group>

                    <Collapse in={legendConfig.show ?? showDefault}>
                        <Stack spacing="xs">
                            <Group spacing="xs">
                                <Config.Label>Scroll behavior</Config.Label>
                                <SegmentedControl
                                    value={dirtyEchartsConfig?.legend?.type}
                                    data={[
                                        { label: 'Default', value: 'plain' },
                                        { label: 'Scroll', value: 'scroll' },
                                    ]}
                                    onChange={(value) =>
                                        handleChange('type', value)
                                    }
                                />
                            </Group>
                            <Group spacing="xs">
                                <Config.Label>Orientation</Config.Label>
                                <SegmentedControl
                                    name="orient"
                                    value={legendConfig.orient ?? 'horizontal'}
                                    onChange={(val) =>
                                        handleChange('orient', val)
                                    }
                                    data={[
                                        {
                                            label: 'Horizontal',
                                            value: 'horizontal',
                                        },
                                        {
                                            label: 'Vertical',
                                            value: 'vertical',
                                        },
                                    ]}
                                />
                            </Group>
                            <PositionConfiguration
                                legendConfig={legendConfig}
                                handleChange={handleChange}
                            />
                        </Stack>
                    </Collapse>
                </Config.Section>
            </Config>
            {projectUuid && (
                <ReferenceLines items={items} projectUuid={projectUuid} />
            )}
            {projectUuid && <TooltipConfig fields={fieldsUsedInChartConfig} />}
        </Stack>
    );
};
