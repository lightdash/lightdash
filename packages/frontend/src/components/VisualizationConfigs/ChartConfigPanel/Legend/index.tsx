import {
    type CompiledDimension,
    type CustomDimension,
    type EchartsLegend,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import {
    Badge,
    Center,
    Collapse,
    Flex,
    Group,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Switch,
} from '@mantine/core';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
import UnitInput from '../../../common/UnitInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { Config } from '../../common/Config';
import { ReferenceLines } from './ReferenceLines';

enum Positions {
    Left = 'left',
    Right = 'right',
    Top = 'top',
    Bottom = 'bottom',
}

enum Units {
    Pixels = 'px',
    Percentage = '%',
}

const units = Object.values(Units);

type MarginConfigurationProps = {
    legendConfig: EchartsLegend;
    handleChange: (prop: string, newValue: string | undefined) => void;
};

// TODO: to be used accross Display & Margins tab
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

    const EmptySpace = () => <div></div>;

    return (
        <Config.Group>
            <Config.Label>Position</Config.Label>

            <Switch
                label={isAutoPosition ? `Auto-position` : `Custom`}
                checked={isAutoPosition}
                onChange={toggleAuto}
            />

            {!isAutoPosition && (
                <SimpleGrid
                    cols={3}
                    spacing="xs"
                    py="xs"
                    sx={{
                        border: '1px solid #E6E6E6',
                        borderRadius: '4px',
                        backgroundColor: '#fafafa',
                    }}
                    mx="auto"
                >
                    {/* Row 1 */}
                    <EmptySpace />
                    <Flex justify="center" align="end">
                        <UnitInput
                            key="top"
                            size="xs"
                            w={70}
                            name="top"
                            units={units}
                            value={legendConfig.top ?? 'auto'}
                            defaultValue="auto"
                            onChange={(e) => handleChange('top', e)}
                        />
                    </Flex>
                    <EmptySpace />
                    {/* Row 2 */}
                    <Flex justify="end" align="start">
                        <UnitInput
                            key="left"
                            size="xs"
                            w={70}
                            name="left"
                            units={units}
                            value={legendConfig.left ?? 'auto'}
                            defaultValue="auto"
                            onChange={(e) => handleChange('left', e)}
                        />
                    </Flex>

                    <Center px="xs" py="one">
                        <Badge color="blue" radius={'xs'} fullWidth h="100%">
                            Position
                        </Badge>
                    </Center>
                    <Flex justify="start" align="center">
                        <UnitInput
                            key="right"
                            size="xs"
                            w={70}
                            name="right"
                            units={units}
                            value={legendConfig.right ?? 'auto'}
                            defaultValue="auto"
                            onChange={(e) => handleChange('right', e)}
                        />
                    </Flex>
                    {/* Row 3 */}
                    <EmptySpace />
                    <Flex justify="center" align="start">
                        <UnitInput
                            key="bottom"
                            size="xs"
                            w={70}
                            name="bottom"
                            units={units}
                            value={legendConfig.bottom ?? 'auto'}
                            defaultValue="auto"
                            onChange={(e) => handleChange('bottom', e)}
                        />
                    </Flex>
                    <EmptySpace />
                </SimpleGrid>
            )}
        </Config.Group>
    );
};

type Props = {
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
};

const LegendPanel: FC<Props> = ({ items }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { dirtyEchartsConfig, setLegend } = visualizationConfig.chartConfig;

    const legendConfig = dirtyEchartsConfig?.legend ?? {};

    console.log('legendConfig', legendConfig);

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
                <Config.Group>
                    <Group spacing="xs" align="center">
                        <Config.Label>Legend</Config.Label>
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
                                <Config.SubLabel>
                                    Scroll behavior
                                </Config.SubLabel>
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
                                <Config.SubLabel>Orientation</Config.SubLabel>
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
                </Config.Group>
            </Config>
            <ReferenceLines items={items} projectUuid={projectUuid} />
        </Stack>
    );
};

export default LegendPanel;
