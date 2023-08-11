import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

import SimpleButton from '../common/SimpleButton';
import Form from '../ReactHookForm/Form';

const CARD_GAP = 20;

export const FormContainer = styled(Form)`
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: ${CARD_GAP}px;
    width: 100%;
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

export const LeftPanelMessage = styled.p`
    color: ${Colors.GRAY1};
`;
