import { Card } from '@blueprintjs/core';
import styled from 'styled-components';

export const CardContent = styled.div`
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

export const Drawer = styled(Card)<{ $state: string }>`
    height: 100%;
    border-radius: 0;
    overflow: hidden;
    transition: ${({ $state }) =>
        ['entering', 'exiting'].includes($state)
            ? 'opacity 500ms ease-in-out, left 500ms ease-in-out'
            : 'none'};
    position: absolute;
    top: 0;
    opacity: ${({ $state }) =>
        ['exiting', 'exited', 'unmounted'].includes($state) ? 0 : 1};
`;
