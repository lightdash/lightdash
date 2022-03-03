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
    margin-bottom: 0.714em;
`;

export const Wrapper = styled.div`
    width: 22.143em;
`;
