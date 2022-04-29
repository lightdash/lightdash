import { Button, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const Wrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
`;

export const TitleWrapper = styled.div`
    flex: 1;
    justify-content: flex-start;
    display: flex;
    align-items: center;
    overflow: hidden;
    margin-right: 10px;
`;

export const ChartName = styled(H3)`
    margin: 0;
`;

export const ChartButton = styled(Button)`
    margin-left: 5px;
`;
