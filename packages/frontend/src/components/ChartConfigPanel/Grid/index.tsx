import { Button, FormGroup, InputGroup } from '@blueprintjs/core';
import { EchartsGrid } from '@lightdash/common';
import startCase from 'lodash/startCase';
import { FC, useState } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { SectionRow } from './Grid.styles';

export const defaultGrid: EchartsGrid = {
    containLabel: true,
    left: '5%', // small padding
    right: '5%', // small padding
    top: '70', // pixels from top (makes room for legend)
    bottom: '30', // pixels from bottom (makes room for x-axis)
};

const positions = ['top', 'bottom', 'left', 'right'] as const;

type Units = '%' | 'px';

const GridPanel: FC = () => {
    const {
        cartesianConfig: { dirtyEchartsConfig, setGrid },
    } = useVisualizationContext();

    const [config, setConfig] = useState<EchartsGrid>({
        ...defaultGrid,
        ...dirtyEchartsConfig?.grid,
    });

    const handleUpdate = (
        position: typeof positions[number],
        value: string,
        currentUnit: Units,
    ) => {
        setConfig((prevState) => {
            const newState = {
                ...prevState,
                [position]: `${value}${currentUnit}`,
            };
            setGrid(newState);
            return newState;
        });
    };

    const handleUpdateUnit = (key: typeof positions[number], unit: Units) => {
        const value = config[key];
        const pureValue = value?.replace(unit === 'px' ? '%' : 'px', '') ?? '';

        if (!pureValue) return;

        handleUpdate(key, pureValue, unit);
    };

    return (
        <SectionRow>
            {positions.map((position) => {
                const value = config[position];
                const currentUnit = value?.includes('%') ? '%' : 'px';
                const nextUnit = currentUnit === '%' ? 'px' : '%';
                const valueWithoutUnit = value?.replace(/%|px/g, '');

                return (
                    <FormGroup
                        key={position}
                        label={startCase(position)}
                        labelFor={`${position}-input`}
                    >
                        <InputGroup
                            id={`${position}-input`}
                            name={position}
                            placeholder={defaultGrid[position]}
                            value={valueWithoutUnit}
                            onChange={(e) =>
                                handleUpdate(
                                    position,
                                    e.target.value,
                                    currentUnit,
                                )
                            }
                            rightElement={
                                <Button
                                    minimal
                                    small
                                    disabled={valueWithoutUnit === ''}
                                    onClick={() =>
                                        handleUpdateUnit(position, nextUnit)
                                    }
                                >
                                    {currentUnit}
                                </Button>
                            }
                        />
                    </FormGroup>
                );
            })}
        </SectionRow>
    );
};

export default GridPanel;
