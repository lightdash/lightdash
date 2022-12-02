import { InputGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const StyledNumberInput = styled(InputGroup)`
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
        appearance: none;
        margin: 0;
    }

    input[type='number'] {
        appearance: textfield;
    }
`;
