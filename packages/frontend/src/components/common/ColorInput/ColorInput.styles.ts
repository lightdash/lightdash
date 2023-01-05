import { InputGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const ColorSquare = styled.div`
    height: 30px;
    width: 30px;
    padding: 4px;
`;

export const ColorSquareInner = styled.div`
    height: 100%;
    width: 100%;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

// fixes a weird bug with group input with left element.
// initially group input does not have a padding-left, only after the rerender
export const StyledColorInput = styled(InputGroup)`
    input {
        padding-left: 30px !important;
    }
`;
