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
import startCase from 'lodash/startCase';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
import UnitInput from '../../../common/UnitInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { ConfigGroup } from '../common/ConfigGroup';
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

const MarginConfiguration: FC<MarginConfigurationProps> = ({
    legendConfig,
    handleChange,
}) => {
    const EmptySpace = () => <div></div>;

    return (
        <SimpleGrid
            cols={3}
            spacing="one"
            sx={{
                border: '1px solid #E6E6E6',
                paddingBottom: '10px',
                borderRadius: '4px',
            }}
        >
            {/* Row 1 */}
            <EmptySpace />
            <Flex justify="center" align="end">
                <UnitInput
                    key="top"
                    size="xs"
                    w={70}
                    label={
                        <ConfigGroup.SubLabel>
                            {startCase(Positions.Top)}
                        </ConfigGroup.SubLabel>
                    }
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
                    label={
                        <ConfigGroup.SubLabel>
                            {startCase(Positions.Left)}
                        </ConfigGroup.SubLabel>
                    }
                    name="left"
                    units={units}
                    value={legendConfig.left ?? 'auto'}
                    defaultValue="auto"
                    onChange={(e) => handleChange('left', e)}
                />
            </Flex>

            <Center pt="lg" px="xs" pb={0}>
                <Badge color="gray" radius={'xs'} fullWidth h="100%">
                    Margin
                </Badge>
            </Center>
            <Flex justify="start" align="center">
                <UnitInput
                    key="right"
                    size="xs"
                    w={70}
                    label={
                        <ConfigGroup.SubLabel>
                            {startCase(Positions.Right)}
                        </ConfigGroup.SubLabel>
                    }
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
                    label={
                        <ConfigGroup.SubLabel>
                            {startCase(Positions.Bottom)}
                        </ConfigGroup.SubLabel>
                    }
                    name="bottom"
                    units={units}
                    value={legendConfig.bottom ?? 'auto'}
                    defaultValue="auto"
                    onChange={(e) => handleChange('bottom', e)}
                />
            </Flex>
            <EmptySpace />
        </SimpleGrid>
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
            <ConfigGroup>
                <Group spacing="xs" align="center">
                    <ConfigGroup.Label>Legend</ConfigGroup.Label>
                    <Switch
                        size="xs"
                        label="Show"
                        labelPosition="left"
                        checked={legendConfig.show ?? showDefault}
                        onChange={(e) =>
                            handleChange('show', e.currentTarget.checked)
                        }
                        styles={{
                            label: {
                                paddingLeft: 4,
                            },
                        }}
                    />
                </Group>

                <Collapse in={legendConfig.show ?? showDefault}>
                    <Stack spacing="xs">
                        <Group spacing="xs">
                            <ConfigGroup.SubLabel>
                                Scroll behavior
                            </ConfigGroup.SubLabel>
                            <SegmentedControl
                                size="xs"
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
                            <ConfigGroup.SubLabel>
                                Orientation
                            </ConfigGroup.SubLabel>
                            <SegmentedControl
                                name="orient"
                                size="xs"
                                value={legendConfig.orient ?? 'horizontal'}
                                onChange={(val) => handleChange('orient', val)}
                                data={[
                                    {
                                        label: 'Horizontal',
                                        value: 'horizontal',
                                    },
                                    { label: 'Vertical', value: 'vertical' },
                                ]}
                            />
                        </Group>

                        <MarginConfiguration
                            legendConfig={legendConfig}
                            handleChange={handleChange}
                        />
                    </Stack>
                </Collapse>
            </ConfigGroup>
            <ReferenceLines items={items} projectUuid={projectUuid} />
        </Stack>
    );
};

export default LegendPanel;
