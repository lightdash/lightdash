import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../common/SimpleButton';
import Form from '../ReactHookForm/Form';

export const FormContainer = styled(Form)`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const WarehouseLogo = styled.img`
    margin-bottom: 10px;
    width: 30px;
`;

export const FormWrapper = styled.div`
    width: 800px;
    margin: 0 auto;
`;

export const CompileProjectButton = styled(Button)``;

export const AdvancedButtonWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
`;

export const AdvancedButton = styled(SimpleButton)`
    padding-right: 2px;
`;
