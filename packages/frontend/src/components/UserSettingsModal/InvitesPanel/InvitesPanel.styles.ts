import { Button, Callout, FormGroup, HTMLSelect } from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../../common/SimpleButton';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';

export const Panel = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const BackButton = styled(SimpleButton)`
    align-self: flex-start;
    padding-left: 0;
    margin-bottom: 20px;
`;

export const InviteForm = styled(Form)`
    display: flex;
    align-items: flex-start;
`;

export const EmailInput = styled(Input)`
    flex: 1;
    margin: 0;
    max-width: 166px !important;

    .bp4-label {
        font-size: 12px;
        color: #5c7080;
        width: 166px !important;
    }
    .bp4-input-group {
        width: 166px;
        margin: 0;
    }
`;

export const SubmitButton = styled(Button)`
    margin: 21px 0 0 auto;
    width: 140px;
`;

export const InviteFormGroup = styled(FormGroup)`
    margin-top: 20px;
    margin-bottom: 0;
`;

export const ShareLinkCallout = styled(Callout)`
    margin-top: 10px;
`;

export const RoleSelectButton = styled(HTMLSelect)`
    margin: 20px 7px 0;
    width: 75.5px !important;
`;
