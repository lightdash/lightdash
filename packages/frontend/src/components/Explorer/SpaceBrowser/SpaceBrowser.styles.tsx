import { Button, Colors, Text } from '@blueprintjs/core';
import styled from 'styled-components';
import LinkButton from '../../common/LinkButton';

export const SpaceBrowserWrapper = styled.div`
    margin-bottom: 40px;
`;

export const SpaceLinkButton = styled(LinkButton)`
    padding: 15px;
    height: 4.857em;
    text-align: center;
    align-items: center;
    justify-content: center;
    .bp4-button-text {
        width: 100%;
        display: flex;
        align-items: center;
        color: rgb(41, 55, 66);
        font-weight: 600;
    }
`;

export const SpaceListWrapper = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 2em 1.5em;
`;

export const CreateDashboardButton = styled(Button)`
    height: 4.857em;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    border: 1px dashed ${Colors.GRAY3} !important;
`;

export const CreateNewButton = styled(Button)`
    color: ${Colors.BLUE3} !important;

    border: 1px solid ${Colors.LIGHT_GRAY1} !important;
`;

export const SpaceTitle = styled(Text)`
    text-align: center;
    margin: auto;
`;
