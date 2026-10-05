import { Text } from '@mantine/core';
import { type FC } from 'react';
import { type DisplayLabel } from './labels';

// A field or parameter name, with its table or model in the lighter weight
// the field picker uses, when it has one to show
const ItemLabel: FC<{ display: DisplayLabel }> = ({ display }) => (
    <>
        {display.group !== null && (
            <Text span inherit fw={400}>
                {`${display.group} `}
            </Text>
        )}
        <Text span inherit fw={500}>
            {display.label}
        </Text>
    </>
);

export default ItemLabel;
