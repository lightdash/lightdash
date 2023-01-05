import { Colors, Icon, InputGroupProps2 } from '@blueprintjs/core';
import { FC } from 'react';
import {
    ColorSquare,
    ColorSquareInner,
    StyledColorInput,
} from './ColorInput.styles';

interface ColorInputProps extends Omit<InputGroupProps2, 'leftElement'> {}

const ColorInput: FC<ColorInputProps> = ({ value: color, ...props }) => {
    return (
        <StyledColorInput
            value={color}
            {...props}
            leftElement={
                <ColorSquare>
                    <ColorSquareInner style={{ backgroundColor: color }}>
                        {!color && <Icon icon="tint" color={Colors.GRAY3} />}
                    </ColorSquareInner>
                </ColorSquare>
            }
        />
    );
};

export default ColorInput;
