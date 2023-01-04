import { Colors, Icon, InputGroup, InputGroupProps2 } from '@blueprintjs/core';
import { FC } from 'react';
import { ColorSquare, ColorSquareInner } from './ColorInput.styles';
interface ColorInputProps extends Omit<InputGroupProps2, 'leftElement'> {}

const ColorInput: FC<ColorInputProps> = ({ value: color, ...props }) => {
    return (
        <InputGroup
            value={color}
            leftElement={
                <ColorSquare>
                    <ColorSquareInner
                        style={{
                            backgroundColor: color,
                        }}
                    >
                        {!color && <Icon icon="tint" color={Colors.GRAY3} />}
                    </ColorSquareInner>
                </ColorSquare>
            }
            {...props}
        />
    );
};

export default ColorInput;
