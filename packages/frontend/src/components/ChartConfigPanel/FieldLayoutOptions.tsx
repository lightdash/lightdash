import { Button, ButtonGroup, Icon } from '@blueprintjs/core';
import {
    Field,
    getItemColor,
    getItemIcon,
    isField,
    TableCalculation,
} from 'common';
import React, { FC } from 'react';
import { GridFieldLabel } from './ChartConfigPanel.styles';

type Props = {
    item: Field | TableCalculation;
    isXActive?: boolean;
    isYActive?: boolean;
    isGroupActive?: boolean;
    onXClick: (isActive: boolean) => void;
    onYClick: (isActive: boolean) => void;
    onGroupClick: (isActive: boolean) => void;
};

const FieldLayoutOptions: FC<Props> = ({
    item,
    isXActive,
    isGroupActive,
    onGroupClick,
    onXClick,
    onYClick,
    isYActive,
}) => {
    return (
        <>
            <GridFieldLabel>
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
            </ButtonGroup>
        </>
    );
};

export default FieldLayoutOptions;
