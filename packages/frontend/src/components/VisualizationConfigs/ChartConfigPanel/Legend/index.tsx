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
    Text,
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
            <Switch
                size="xs"
                label="Show legend"
                checked={legendConfig.show ?? showDefault}
                onChange={(e) => handleChange('show', e.currentTarget.checked)}
                styles={{
                    label: {
                        paddingLeft: 4,
                    },
                }}
            />
            <Collapse in={legendConfig.show ?? showDefault}>
                <Stack>
                    <Group spacing="xs">
                        <ConfigGroup.SubLabel>
                            Legend scroll behaviour
                        </ConfigGroup.SubLabel>
                        <SegmentedControl
                            size="xs"
                            value={dirtyEchartsConfig?.legend?.type}
                            data={[
                                { label: 'Default', value: 'plain' },
                                { label: 'Scroll', value: 'scroll' },
                            ]}
                            onChange={(value) => handleChange('type', value)}
                        />
                    </Group>

                    <Group position="apart" noWrap align="start">
                        <ConfigGroup>
                            <ConfigGroup.Label>Position</ConfigGroup.Label>
                            {[
                                [Positions.Top, Positions.Bottom],
                                [Positions.Left, Positions.Right],
                            ].map((positionGroup) => (
                                <SimpleGrid
                                    cols={2}
                                    spacing="md"
                                    key={positionGroup.join(',')}
                                >
                                    {positionGroup.map((position) => (
                                        <UnitInput
                                            key={position}
                                            size="xs"
                                            label={
                                                <Text fw={400}>
                                                    {startCase(position)}{' '}
                                                </Text>
                                            }
                                            name={position}
                                            units={units}
                                            value={
                                                legendConfig[position] ?? 'auto'
                                            }
                                            defaultValue="auto"
                                            onChange={(e) =>
                                                handleChange(position, e)
                                            }
                                        />
                                    ))}
                                </SimpleGrid>
                            ))}
                        </ConfigGroup>
                        <ConfigGroup>
                            <ConfigGroup.Label>Orientation</ConfigGroup.Label>
                            <SegmentedControl
                                name="orient"
                                orientation="vertical"
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
                        </ConfigGroup>
                    </Group>
                </Stack>
                {/* <Center
                        display="grid"
                        sx={{
                            gridTemplateRows: 'auto 1fr auto',
                            gridTemplateColumns: '1fr auto 1fr',
                        }}
                    >
                        {[
                            {
                                position: Positions.Top,
                                gridColumn: '2 / 3',
                                gridRow: '1 / 2',
                            },
                            {
                                position: Positions.Left,
                                gridColumn: '1 / 2',
                                gridRow: '2 / 3',
                            },
                            {
                                gridColumn: '2 / 2',
                                gridRow: '2 / 2',
                            },
                            {
                                position: Positions.Right,
                                gridColumn: '3 / 4',
                                gridRow: '2 / 3',
                            },

                            {
                                position: Positions.Bottom,
                                gridColumn: '2 / 3',
                                gridRow: '3 / 4',
                            },
                        ].map((row) => (
                            <Flex
                                key={row.position}
                                justify="center"
                                align="center"
                                sx={{
                                    gridColumn: row.gridColumn,
                                    gridRow: row.gridRow,
                                }}
                            >
                                {row.position ? (
                                    <UnitInput
                                        size="xs"
                                        labelProps={{
                                            fw: 400,
                                        }}
                                        label={startCase(row.position)}
                                        name={row.position}
                                        units={units}
                                        value={
                                            legendConfig[row.position] ?? 'auto'
                                        }
                                        defaultValue="auto"
                                        onChange={(e) =>
                                            handleChange(row.position, e)
                                        }
                                    />
                                ) : (
                                    <Text mx="xl" fw={500}>
                                        Position
                                    </Text>
                                )}
                            </Flex>
                        ))}
                    </Center> */}
            </Collapse>

            <ReferenceLines items={items} projectUuid={projectUuid} />
        </Stack>
    );
};

export default LegendPanel;
