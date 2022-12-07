import { AnchorButton, Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const SlackSettingsWrapper = styled.div`
    display: flex;
    flex-direction: row;
    gap: 20px;
`;
export const AppearancePanelWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
    width: 400px;
`;

export const Title = styled.h3`
    margin: 5px 0 20px;
`;

export const SlackIcon = styled.img`
    width: 32px;
    height: 32px;
`;

export const Description = styled.p`
    color: ${Colors.GRAY3};
    margin: 0px;
`;

export const SlackName = styled.span`
    color: ${Colors.BLACK};
`;

export const Actions = styled.div`
    justify-content: flex-end;
    display: flex;
    flex-direction: row;
    gap: 10px;
    height: 30px;
    width: 280px;
`;
