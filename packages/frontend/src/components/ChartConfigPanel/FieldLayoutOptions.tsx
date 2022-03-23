import { Button } from '@blueprintjs/core';
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
    const [numberOfFields, setNumberOfFields] = useState([items]);

    const onAddField = () => {
        setNumberOfFields([...numberOfFields, items]);
    };
    const onRemoveField = (item: number) => {};

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

                {numberOfFields.map((field, index) => (
                    <AxisFieldDropdown key={index}>
                        <FieldAutoComplete
                            fields={field}
                            //   activeField={(item) => item}
                            onChange={(item) => {
                                if (isField(item)) {
                                    setActiveYField(item);
                                }
                            }}
                        />
                        {index !== 0 && (
                            <Button
                                minimal
                                icon="cross"
                                onClick={() => onRemoveField(index)}
                            />
                        )}
                    </AxisFieldDropdown>
                ))}
                {numberOfFields.length < items.length && (
                    <Button
                        minimal
                        intent="primary"
                        onClick={() => onAddField()}
                    >
                        + Add field
                    </Button>
                )}
            </AxisGroup>
        </>
    );
};

export default FieldLayoutOptions;
