import { Colors, Icon } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import React, { FC } from 'react';
import { BlockPicker, ColorResult } from 'react-color';
import { useToggle } from 'react-use';
import { useOrganisation } from '../../../../hooks/organisation/useOrganisation';
import { ColorButton, ColorButtonInner } from './Series.styles';

type Props = {
    color?: string;
    onChange: (value: string) => void;
};

const SeriesColorPicker: FC<Props> = ({ color, onChange }) => {
    const [isOpen, toggle] = useToggle(false);
    const { isLoading: isOrgLoading, data } = useOrganisation();

    const colors = data?.chartColors || ECHARTS_DEFAULT_COLORS;
    return (
        <Popover2
            isOpen={isOpen}
            content={
                <BlockPicker
                    color={color}
                    colors={colors}
                    onChange={(result: ColorResult) => {
                        onChange(result.hex);
                    }}
                />
            }
            position="bottom"
            hasBackdrop
            backdropProps={{
                onClick: (e) => {
                    e.stopPropagation();
                    toggle(false);
                },
            }}
        >
            <ColorButton onClick={toggle}>
                <ColorButtonInner
                    style={{
                        backgroundColor: color,
                    }}
                >
                    {!color && <Icon icon="tint" color={Colors.GRAY3} />}
                </ColorButtonInner>
            </ColorButton>
        </Popover2>
    );
};

export default SeriesColorPicker;
