import {
    CompiledDimension,
    CustomDimension,
    Field,
    TableCalculation,
} from '@lightdash/common';
import {
    Collapse,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import startCase from 'lodash/startCase';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import UnitInput from '../../../common/UnitInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
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
                label="Show legend"
                checked={legendConfig.show ?? showDefault}
                onChange={(e) => handleChange('show', e.currentTarget.checked)}
            />
            <Collapse in={legendConfig.show ?? showDefault}>
                <Switch
                    label="Scroll legend"
                    mb="md"
                    checked={dirtyEchartsConfig?.legend?.type !== 'plain'}
                    onChange={(e) =>
                        handleChange(
                            'type',
                            e.currentTarget.checked ? 'scroll' : 'plain',
                        )
                    }
                />
                <Text fw={600}>Position</Text>
                {[
                    [Positions.Left, Positions.Right],
                    [Positions.Top, Positions.Bottom],
                ].map((positionGroup) => (
                    <SimpleGrid
                        cols={2}
                        mt="xs"
                        ml="xs"
                        mb="md"
                        spacing="md"
                        key={positionGroup.join(',')}
                    >
                        {positionGroup.map((position) => (
                            <UnitInput
                                key={position}
                                label={
                                    <Text fw={400}>{startCase(position)} </Text>
                                }
                                name={position}
                                units={units}
                                value={legendConfig[position] ?? 'auto'}
                                defaultValue="auto"
                                onChange={(e) => handleChange(position, e)}
                            />
                        ))}
                    </SimpleGrid>
                ))}

                <Text fw={600}>Orientation</Text>
                <SegmentedControl
                    name="orient"
                    color="blue"
                    size="sm"
                    fullWidth
                    value={legendConfig.orient ?? 'horizontal'}
                    onChange={(val) => handleChange('orient', val)}
                    data={[
                        { label: 'Horizontal', value: 'horizontal' },
                        { label: 'Vertical', value: 'vertical' },
                    ]}
                />
            </Collapse>
            <ReferenceLines items={items} projectUuid={projectUuid} />
        </Stack>
    );
};

export default LegendPanel;
