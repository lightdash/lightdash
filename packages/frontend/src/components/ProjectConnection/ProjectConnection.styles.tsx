import { Button, Card, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../common/SimpleButton';
import Form from '../ReactHookForm/Form';

export const FormContainer = styled(Form)`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const FormWrapper = styled.div`
    display: flex;
    flex-direction: column;
    width: 800px;
    margin: 0 auto;
`;

export const CompileProjectButton = styled(Button)`
    align-self: flex-end;
`;

export const AdvancedButtonWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
`;

export const AdvancedButton = styled(SimpleButton)`
    padding-right: 2px;
`;

export const ProjectConnectionCard = styled(Card)`
    margin-bottom: 20px;
    display: flex;
    flex-direction: row;
    gap: 20px;
`;

export const LeftPanel = styled.div`
    flex: 1;
`;

export const RightPanel = styled.div`
    flex: 1;
`;

export const LeftPanelTitle = styled.div`
    margin-bottom: 10px;
    margin-top: 10px;

    h5 {
        display: inline;
        margin-right: 5px;
    }
`;

export const LeftPanelMessage = styled.p`
    color: ${Colors.GRAY1};
`;
