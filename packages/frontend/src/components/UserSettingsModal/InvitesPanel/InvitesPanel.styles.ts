import { Button, Callout, FormGroup } from '@blueprintjs/core';
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
    gap: 20px;
`;

export const EmailInput = styled(Input)`
    flex: 1;
    margin: 0;
`;

export const SubmitButton = styled(Button)`
    margin-top: 23px;
`;

export const InviteFormGroup = styled(FormGroup)`
    margin-top: 20px;
    margin-bottom: 0;
`;

export const ShareLinkCallout = styled(Callout)`
    margin-top: 10px;
`;
