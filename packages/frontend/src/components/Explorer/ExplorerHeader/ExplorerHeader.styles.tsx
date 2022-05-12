import { Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const Wrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    height: 80px;
    width: 100%;
    position: absolute;
    top: 50px;
    left: 0;
    background: ${Colors.WHITE};
    border-bottom: 0.5px solid #c5cbd3;
    padding: 16px 21px;
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
    margin: 0 5px 0 0;
`;
