import { Card } from '@blueprintjs/core';
import styled from 'styled-components';

export const StyledCard = styled(Card)<{ isOpen?: boolean }>`
    padding: 5px;
    height: ${({ isOpen }) => (isOpen ? '100%' : 'auto')} h5 {
        margin: 0;
        padding: 0;
    }
`;

export const CardHeader = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;

    h5 {
        margin: 0;
        padding: 0;
    }
`;
