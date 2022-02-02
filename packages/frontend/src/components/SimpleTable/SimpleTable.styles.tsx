import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const TableWrapper = styled.div`
    height: 100%;
    padding: 20px 10px 10px;
    min-height: 300px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
`;

export const TableInnerWrapper = styled.div`
    display: flex;
    max-width: 100%;
    flex-direction: row;
`;

export const TableHeader = styled.thead`
    background: ${Colors.GRAY4};
`;
