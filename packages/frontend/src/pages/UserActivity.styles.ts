import { Callout, Card, Colors, H5, Tabs } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import styled, { css } from 'styled-components';

export const Container = styled.div`
    display: grid;
    grid-template-columns: 300px 300px 300px 300px;
    grid-template-rows: 200px 200px 400px 400px 400px;
    gap: 10px 10px;
    grid-template-areas:
        'total-users total-users total-users weekly-active'
        'viewers editors admins weekly-active'
        'chart-active-users chart-active-users queries-per-user queries-per-user'
        'table-most-queries table-most-queries table-most-charts table-most-charts'
        'table-not-logged-in table-not-logged-in . .';
`;
export const ActivityCard = styled(Card)<{ grid: string }>`
    vertical-align: middle;
    text-align: center;
    ${({ grid }) => css`
        grid-area: ${grid};
    `}
    overflow: auto;
`;

export const ChartCard = styled(ActivityCard)``;

export const BigNumberContainer = styled.div`
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
`;

export const BigNumber = styled.div`
    font-size: 4em;
    line-height: 1.196em;
    font-weight: 500;
    color: ${Colors.DARK_GRAY4};
`;

export const BigNumberLabel = styled.h2`
    text-align: center;
    color: ${Colors.GRAY3};
    font-weight: 500;
    line-height: 1.389em;
    font-size: 1.286em;
    margin: 0;
`;

export const Description = styled.p`
    float: left;
    font-weight: 600;
`;
