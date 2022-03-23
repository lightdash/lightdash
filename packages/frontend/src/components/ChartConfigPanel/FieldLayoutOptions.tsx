import { Field, isField, TableCalculation } from 'common';
import React, { FC, useState } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import {
    AxisFieldDropdown,
    AxisGroup,
    AxisTitle,
} from './ChartConfigPanel.styles';

type Item = Field | TableCalculation;

type Props = {
    items: (Field | TableCalculation)[];
    // item: Field | TableCalculation;
    // isXActive?: boolean;
    // isYActive?: boolean;
    // isGroupActive?: boolean;
    // onXClick: (isActive: boolean) => void;
    // onYClick: (isActive: boolean) => void;
    // onGroupClick: (isActive: boolean) => void;
};

const FieldLayoutOptions: FC<Props> = ({
    items,
    // isXActive,
    // isGroupActive,
    // onGroupClick,
    // onXClick,
    // onYClick,
    // isYActive,
}) => {
    console.log(items);
    const [activeXField, setActiveXField] = useState<Item>();
    const [activeYField, setActiveYField] = useState<Item>();
    return (
        <>
            {/* <GridFieldLabel>
                <Icon icon={getItemIcon(item)} color={getItemColor(item)} />
                <span>
                    {isField(item) ? `${item.tableLabel} ` : ''}
                    <b>{isField(item) ? item.label : item.displayName}</b>
                </span>
            </GridFieldLabel>
            <ButtonGroup>
                <Button
                    intent={isXActive ? 'primary' : 'none'}
                    onClick={() => onXClick(!isXActive)}
                >
                    x
                </Button>
                <Button
                    intent={isYActive ? 'primary' : 'none'}
                    onClick={() => onYClick(!isYActive)}
                >
                    y
                </Button>
                <Button
                    intent={isGroupActive ? 'primary' : 'none'}
                    onClick={() => onGroupClick(!isGroupActive)}
                >
                    group
                </Button>
            </ButtonGroup> */}
            <AxisGroup>
                <AxisTitle>X axis field</AxisTitle>
                <AxisFieldDropdown>
                    <FieldAutoComplete
                        fields={items}
                        activeField={activeXField}
                        onChange={(item) => {
                            if (isField(item)) {
                                setActiveXField(item);
                            }
                        }}
                    />
                </AxisFieldDropdown>
            </AxisGroup>
            <AxisGroup>
                <AxisTitle>Y axis field</AxisTitle>
                <AxisFieldDropdown>
                    <FieldAutoComplete
                        fields={items}
                        activeField={activeYField}
                        onChange={(item) => {
                            if (isField(item)) {
                                setActiveYField(item);
                            }
                        }}
                    />
                </AxisFieldDropdown>
            </AxisGroup>
        </>
    );
};

export default FieldLayoutOptions;
