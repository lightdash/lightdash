import { Button, Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const Wrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    height: 70px;
    width: 100%;
    position: sticky;
    top: 50px;
    left: 0;
    z-index: 1;
    background: ${Colors.WHITE};
    border-bottom: 0.5px solid #c5cbd3;
    padding: 16px 10px 16px 21px;
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

export const OptionsMenu = styled(Button)`
    margin-left: 10px;
`;
