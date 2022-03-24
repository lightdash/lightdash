import { Colors, Icon } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ECHARTS_DEFAULT_COLORS } from 'common';
import React, { FC } from 'react';
import { BlockPicker, ColorResult } from 'react-color';
import { useToggle } from 'react-use';
import { ColorButton } from './ChartConfigPanel.styles';

type Props = {
    color?: string;
    onChange: (value: string) => void;
};

const SeriesColorPicker: FC<Props> = ({ color, onChange }) => {
    const [isOpen, toggle] = useToggle(false);
    return (
        <Popover2
            isOpen={isOpen}
            content={
                <BlockPicker
                    color={color}
                    colors={ECHARTS_DEFAULT_COLORS}
                    onChange={(result: ColorResult) => {
                        onChange(result.hex);
                        toggle(false);
                    }}
                />
            }
            position="bottom"
            hasBackdrop
            lazy={true}
            backdropProps={{
                onClick: (e) => {
                    e.stopPropagation();
                    toggle(false);
                },
            }}
        >
            <ColorButton
                onClick={toggle}
                style={{
                    backgroundColor: color,
                }}
            >
                {!color && <Icon icon="tint" color={Colors.GRAY3} />}
            </ColorButton>
        </Popover2>
    );
};

export default SeriesColorPicker;
