import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import Form from '../ReactHookForm/Form';

export const FormContainer = styled(Form)`
    width: 100%;
`;

export const WarehouseLogo = styled.img`
    margin-bottom: 10px;
`;

export const CompileProjectWrapper = styled.div`
    height: 70px;
    width: 100%;
    position: sticky;
    background: ${Colors.WHITE};
    bottom: 0;
`;

export const FormWrapper = styled.div`
    width: 800px;
    margin: auto;
`;

export const CompileProjectButton = styled(Button)`
    height: 40px;
    float: right;
    margin-top: 15px;
`;
