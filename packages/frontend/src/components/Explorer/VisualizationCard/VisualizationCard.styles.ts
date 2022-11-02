import { Card } from '@blueprintjs/core';
import styled from 'styled-components';

export const CardHeaderTitle = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;

    h5 {
        margin: 0;
        padding: 0;
    }
`;
export const CardHeader = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
`;
export const CardHeaderButtons = styled.div`
    display: inline-flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-right: 10px;
`;
