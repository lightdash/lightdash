import { AnchorButton, Button } from '@blueprintjs/core';
import styled from 'styled-components';

export const AppearancePanelWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const Title = styled.h3`
    margin: 0 0 10px;
`;

export const SlackButton = styled(AnchorButton)`
    padding: 0;
`;
