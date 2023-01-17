import { NumericInput } from '@blueprintjs/core';
import styled from 'styled-components';

export const StyledNumericInput = styled(NumericInput)`
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
        appearance: none;
        margin: 0;
    }

    input[type='number'] {
        appearance: textfield;
    }
`;
