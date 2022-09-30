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

export const CompileProjectWrapper = styled.div<{ fixedButton?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    position: sticky;
    background: ${Colors.WHITE};
    border-top: 1px solid ${Colors.LIGHT_GRAY1};
    bottom: 0;
    margin-top: auto;
    padding: 20px 0;
    ${({ fixedButton }) =>
        fixedButton &&
        `
            position: fixed;
            z-index: 1;
        `}
`;

export const CompileProjectFixedWidthContainer = styled.div`
    width: 800px;
    display: flex;
    justify-content: flex-end;
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
