import { Card } from '@blueprintjs/core';
import styled from 'styled-components';

export const CardHeader = styled.div`
    display: flex;
    flexdirection: row;
    alignitems: center;
`;

export const MainCard = styled(Card)`
    padding: 5px;
    overflow-y: hidden;
`;

export const VisualizationCardContentWrapper = styled.div`
    height: 300px;
    padding: 10px;
`;
