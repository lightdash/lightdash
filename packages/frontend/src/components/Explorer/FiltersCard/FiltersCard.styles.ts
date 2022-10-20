import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const CardHeader = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;

    h5 {
        margin: 0 10px 0 0;
        padding: 0;
    }
`;

export const Tooltip = styled.p`
    padding: 0;
    margin: 0;
`;

export const FilterValues = styled.span`
    font-weight: 700;
`;

export const DisabledFilterHeader = styled.p`
    margin: 0;
    color: ${Colors.GRAY2};
`;
