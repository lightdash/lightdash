import React, { useMemo } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import {
    Collapse,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { EchartsLegend } from '@lightdash/common';
import startCase from 'lodash-es/startCase';
import UnitInput from '../../common/UnitInput';

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

const PieChartDisplayConfig: React.FC = () => {
    const {
        pieChartConfig: { validPieChartConfig, setLegend, showLegend, toggleShowLegend },
    } = useVisualizationContext();

    const legendConfig = useMemo<EchartsLegend>(
        () => ({
            ...validPieChartConfig?.legend,
        }),
        [validPieChartConfig?.legend],
    );

    const handleChange = (
        prop: string,
        newValue: string | boolean | undefined,
    ) => {
        const newState = { ...legendConfig, [prop]: newValue };
        setLegend(newState);
        return newState;
    };

    return (
        <Stack>
            <Switch
                label="Show legend"
                checked={showLegend}
                onChange={toggleShowLegend}
            />
            <Collapse in={legendConfig.show ?? showLegend}>
                <Switch
                    label="Scroll legend"
                    mb="md"
                    checked={validPieChartConfig?.legend?.type !== 'plain'}
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
        </Stack>
    );
};

export default PieChartDisplayConfig;
