import { FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const InputWrapper = styled(FormGroup)`
    & label.bp3-label {
        font-weight: 500;
        display: inline-flex;
        gap: 0.214em;
    }
`;

export const FieldRow = styled.div`
    display: flex;
    margin-bottom: 20px;
    align-items: flex-start;
`;

export const FieldRowInputs = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 10px;
`;

export const FieldRowInlineInputs = styled.div`
    display: flex;
    gap: 10px;
`;

export const Wrapper = styled.div`
    width: 22.143em;
`;

export const ColorButton = styled.button`
    height: 30px;
    width: 30px;
    cursor: pointer;
    border: none;
    background-color: transparent;

    box-sizing: border-box;
    box-shadow: 0 0 0 0 rgb(19 124 189 / 0%), 0 0 0 0 rgb(19 124 189 / 0%),
        inset 0 0 0 1px rgb(16 22 26 / 15%), inset 0 1px 1px rgb(16 22 26 / 20%);
    border-radius: 3px;
`;
