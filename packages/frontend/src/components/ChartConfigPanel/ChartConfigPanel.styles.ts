import { FormGroup, HTMLSelect } from '@blueprintjs/core';
import styled from 'styled-components';

export const InputWrapper = styled(FormGroup)`
    & label.bp3-label {
        font-weight: 500;
        display: inline-flex;
        gap: 3px;
    }
    & .bp3-html-select {
        width: 100%;
    }
`;

export const FieldRow = styled(`div`)`
    display: flex;
    margin-bottom: 10px;
`;

export const Wrapper = styled(`div`)`
    width: 310px;
`;

export const SelectInput = styled(HTMLSelect)`
    width: 100% !important;
`;
