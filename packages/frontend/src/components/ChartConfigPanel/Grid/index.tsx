import { Button, FormGroup, InputGroup } from '@blueprintjs/core';
import { EchartsGrid } from '@lightdash/common';
import startCase from 'lodash/startCase';
import { FC, useMemo } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { SectionRow } from './Grid.styles';

export const defaultGrid = {
    containLabel: true,
    left: '5%', // small padding
    right: '5%', // small padding
    top: '70px', // pixels from top (makes room for legend)
    bottom: '30px', // pixels from bottom (makes room for x-axis)
};

const positions = ['top', 'bottom', 'left', 'right'] as const;

enum Units {
    Pixels = 'px',
    Percentage = '%',
}

const getNextUnit = (current?: Units): Units | undefined => {
    if (!current) return;

    const units = Object.values(Units);
    const currentIndex = units.indexOf(current);
    return units.concat(units[0])[currentIndex + 1];
};

const getValueAndUnit = (valueWithUnit?: string): [string?, Units?] => {
    if (!valueWithUnit || valueWithUnit === '') return [];

    const unit =
        Object.values(Units).find((u) => valueWithUnit.endsWith(u)) ||
        Units.Pixels;

    const value = valueWithUnit.replace(unit, '');
    return [value, unit];
};

const GridPanel: FC = () => {
    const {
        cartesianConfig: { dirtyEchartsConfig, setGrid },
    } = useVisualizationContext();

    const config = useMemo<EchartsGrid>(
        () => ({
            ...defaultGrid,
            ...dirtyEchartsConfig?.grid,
        }),
        [dirtyEchartsConfig?.grid],
    );

    const handleUpdate = (
        position: typeof positions[number],
        value: string,
        unit: Units = Units.Pixels,
    ) => {
        const newValue = value && value !== '' ? `${value}${unit}` : undefined;

        const newState = { ...config, [position]: newValue };
        setGrid(newState);
        return newState;
    };

    const handleUpdateUnit = (
        key: typeof positions[number],
        nextUnit: Units = Units.Pixels,
    ) => {
        const originalValue = config[key];
        const [value] = getValueAndUnit(originalValue);

        if (!value || value === '') return;

        handleUpdate(key, value, nextUnit);
    };

    return (
        <SectionRow>
            {positions.map((position) => {
                const [value, unit] = getValueAndUnit(config[position]);
                const [placeholder, placeholderUnit] = getValueAndUnit(
                    defaultGrid[position],
                );

                const nextUnit = getNextUnit(unit);

                return (
                    <FormGroup
                        key={position}
                        label={startCase(position)}
                        labelFor={`${position}-input`}
                    >
                        <InputGroup
                            type="number"
                            id={`${position}-input`}
                            name={position}
                            placeholder={placeholder}
                            value={value || ''}
                            onChange={(e) =>
                                handleUpdate(
                                    position,
                                    e.target.value,
                                    value ? unit : placeholderUnit,
                                )
                            }
                            rightElement={
                                <Button
                                    minimal
                                    small
                                    disabled={!value}
                                    onClick={() =>
                                        handleUpdateUnit(
                                            position,
                                            value ? nextUnit : placeholderUnit,
                                        )
                                    }
                                >
                                    {unit || placeholderUnit}
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
