import { FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';
import Form from '../../ReactHookForm/Form';
import Select from '../../ReactHookForm/Select';

export const ProjectAccessForm = styled(Form)`
    display: flex;
    align-items: flex-start;
`;

export const RoleSelectButton = styled(Select)`
    margin-top: 20px;
    margin-left: 7px;
`;

export const EmailForm = styled(FormGroup)`
    flex: 1;
    margin: 0;
    .bp4-input-group {
        margin: 0;
    }
    .bp4-label {
        font-size: 12px;
        color: #5c7080;
    }
`;
