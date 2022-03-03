import { FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const InputWrapper = styled(FormGroup)`
    & label.bp3-label {
        font-weight: 500;
        display: inline-flex;
        gap: 3px;
    }
`;

export const FieldRow = styled(`div`)`
    display: flex;
    margin-bottom: 10px;
`;

export const Wrapper = styled(`div`)`
    width: 310px;
`;
