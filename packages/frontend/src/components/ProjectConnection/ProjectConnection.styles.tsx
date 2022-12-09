import { Button, Card, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../common/SimpleButton';
import Form from '../ReactHookForm/Form';

const CONTENT_WIDTH = 800;
const BIG_BUTTON_HEIGHT = 40;
const CARD_PADDING = 20;
const CARD_GAP = 20;

interface FormContainerProps {
    hasPaddingBottom: boolean;
}

export const FormContainer = styled(Form)<FormContainerProps>`
    width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: ${CARD_GAP}px;

    ${({ hasPaddingBottom }) =>
        hasPaddingBottom
            ? `padding-bottom: ${CARD_PADDING * 2 + BIG_BUTTON_HEIGHT}px;`
            : ''}
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

export const FloatingCard = styled(Card)`
    position: fixed;
    justify-content: flex-end;
    display: flex;
    width: ${CONTENT_WIDTH}px;
    bottom: 0;
`;
