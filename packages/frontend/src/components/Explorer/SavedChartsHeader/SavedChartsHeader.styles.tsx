import { Button, Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const Wrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    height: 80px;
    width: 100%;
    position: relative;
    top: 0;
    left: 0;
    z-index: 1;
    background: ${Colors.WHITE};
    border-bottom: 0.5px solid #c5cbd3;
    padding: 15px 20px 15px 20px;
`;

export const TitleWrapper = styled.div`
    flex: 1;
    justify-content: flex-start;
    display: flex;
    align-items: flex-start;
    overflow: hidden;
    margin-right: 10px;
    flex-direction: column;
`;

export const ChartName = styled(H3)`
    margin: 0 5px 0 0;
`;

export const ButtonWithMarginLeft = styled(Button)`
    margin-left: 10px;
`;
