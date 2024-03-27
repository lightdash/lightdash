import {
    type CompiledDimension,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import {
    Collapse,
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
                <ConfigGroup.LabelGroup>
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
                </ConfigGroup.LabelGroup>

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

                        {[
                            [
                                Positions.Top,
                                Positions.Right,
                                Positions.Bottom,
                                Positions.Left,
                            ],
                        ].map((positionGroup) => (
                            <SimpleGrid cols={4} key={positionGroup.join(',')}>
                                {positionGroup.map((position) => (
                                    <UnitInput
                                        key={position}
                                        size="xs"
                                        label={
                                            <ConfigGroup.SubLabel>
                                                {startCase(position)}{' '}
                                            </ConfigGroup.SubLabel>
                                        }
                                        name={position}
                                        units={units}
                                        value={legendConfig[position] ?? 'auto'}
                                        defaultValue="auto"
                                        onChange={(e) =>
                                            handleChange(position, e)
                                        }
                                    />
                                ))}
                            </SimpleGrid>
                        ))}
                    </Stack>
                </Collapse>
            </ConfigGroup>
            <ReferenceLines items={items} projectUuid={projectUuid} />
        </Stack>
    );
};

export default LegendPanel;
