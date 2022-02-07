import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const FilterGroupWrapper = styled.div`
    margin: 10px 10px 20px 10px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: start;
    gap: 10px;
`;

export const FilterGroupHeader = styled.div`
    height: 30px;
    display: inline-flex;
    align-items: center;

    p {
        margin: 0;
        color: ${Colors.GRAY2};
    }
`;

export const FilterGroupItemsWrapper = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-left: 60px;
`;
