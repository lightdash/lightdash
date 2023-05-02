import { Button } from '@blueprintjs/core';
import styled from 'styled-components';
import Form from '../ReactHookForm/Form';

export const StyledForm = styled(Form)`
    display: flex;
    flex-direction: column;
    width: 200px;

    & .bp4-label {
        white-space: nowrap;
    }
`;

export const ApplyButton = styled(Button)`
    align-self: flex-end;
`;
