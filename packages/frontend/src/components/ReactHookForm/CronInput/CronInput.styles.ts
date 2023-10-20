import { Colors, Icon, NumericInput } from '@blueprintjs/core';
import styled from 'styled-components';

export const InlinedLabel = styled.label`
    line-height: 30px;
    color: ${Colors.GRAY1};
`;

export const InlineIcon = styled(Icon)`
    margin-top: 7px;
    padding-bottom: 0px;
    color: ${Colors.GRAY1};
`;
export const InlinedInputs = styled.div`
    display: inline-flex;
    gap: 10px;
    color: ${Colors.GRAY1};
`;

export const DaysInput = styled(NumericInput)`
    input {
        width: 50px !important;
    }
`;
