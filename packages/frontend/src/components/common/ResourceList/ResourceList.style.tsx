import { Card, Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const ResourceListWrapper = styled(Card)`
    width: 768px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
`;

export const ResourceListHeader = styled.div`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const Spacer = styled.div`
    flex: 1 0 auto;
`;

export const Title = styled(H3)`
    flex: 0 0 auto;
    margin: 0;
    color: ${Colors.GRAY1};
`;
