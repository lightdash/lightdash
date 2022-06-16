import { Card, Colors, H5 } from '@blueprintjs/core';
import styled from 'styled-components';

export const TileBaseWrapper = styled(Card)`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const HeaderContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: baseline;
    gap: 20px;
`;

export const TitleWrapper = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
`;

export const Title = styled(H5)`
    margin: 0;
`;

export const HeaderWrapper = styled.div`
    display: flex;
    flex-direction: column;
    margin-bottom: 15px;
`;

export const FilterLabel = styled.span`
    color: ${Colors.GRAY2};
    font-weight: 500;
    font-size: 0.857em;
    line-height: 1.583em;
    margin: 0.5em 0 1em;
`;

export const ChartContainer = styled.div`
    flex: 1;
    overflow: hidden;
    display: flex;
`;
