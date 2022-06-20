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

export const CompileProjectWrapper = styled.div`
    height: 70px;
    width: 100%;
    position: sticky;
    background: ${Colors.WHITE};
    border-top: 1px solid ${Colors.LIGHT_GRAY1};
    bottom: 0;
    margin-top: auto;
`;

export const FormWrapper = styled.div`
    width: 800px;
    margin: 0 auto;
`;

export const CompileProjectButton = styled(Button)`
    height: 40px;
    width: 215px;
    float: right;
    margin: 15px 0;
`;

export const AdvancedButtonWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
`;

export const AdvancedButton = styled(SimpleButton)`
    padding-right: 2px;
`;
