import { NumericInput } from '@blueprintjs/core';
import styled from 'styled-components';

export const InlinedLabel = styled.label`
    line-height: 30px;
`;
export const InlinedInputs = styled.div`
    display: inline-flex;
    gap: 10px;
`;

export const DaysInput = styled(NumericInput)`
    input {
        width: 50px !important;
    }
`;

export const MinutesInput = styled(NumericInput)`
    input {
        width: 50px !important;
    }
`;
