import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const DividerWrapper = styled.div`
    margin: 20px 0;
    display: flex;
    flex-direction: row;
    gap: 15px;
    color: ${Colors.GRAY4};
    align-items: center;
`;

export const Divider = styled.span`
    display: block;
    width: 100%;
    height: 1px;
    background: ${Colors.LIGHT_GRAY3};
`;
