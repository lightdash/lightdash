import { Card } from '@blueprintjs/core';
import styled from 'styled-components';

export const CardWrapper = styled(Card)`
    padding: 5px;
`;

export const CardHeader = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
`;

export const CardHeaderLeftContent = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;

    h5 {
        margin: 0;
        padding: 0;
        margin-right: 10px;
    }
`;
export const CardHeaderRightContent = styled.div`
    display: flex;
    align-items: center;
    margin-right: 10px;
    gap: 10px;
`;

export const TableContainer = styled.div`
    min-height: 21.429em;
    max-height: 800px;
    display: flex;
`;
