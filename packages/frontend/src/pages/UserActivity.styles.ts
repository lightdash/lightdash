import styled, { css } from 'styled-components';

export const UserAnalyticsPageHeader = styled.div`
    margin-top: 10px;
    margin-bottom: 30px;
`;

export const Container = styled.div`
    display: grid;
    grid-template-columns: 300px 300px 300px 300px;
    grid-template-rows: 200px 200px 400px 400px 400px 400px;
    gap: 10px 10px;
    grid-template-areas:
        'total-users  total-users weekly-active weekly-active'
        'viewers interactive-viewers editors admins '
        'chart-active-users chart-active-users queries-per-user queries-per-user'
        'table-most-queries table-most-queries table-most-charts table-most-charts'
        'table-not-logged-in table-not-logged-in . .'
        'table-dashboard-views table-dashboard-views table-chart-views table-chart-views';
`;

export const ActivityCard = styled.div<{ grid: string }>`
    background-color: #fff;
    border-radius: 2px;
    padding: 20px;
    border: 1px solid #dee2e6;
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
    color: #383e47;
`;

export const BigNumberLabel = styled.h2`
    text-align: center;
    color: #8f99a8;
    font-weight: 500;
    line-height: 1.389em;
    font-size: 1.286em;
    margin: 0;
`;

export const Description = styled.p`
    float: left;
    font-weight: 600;
`;
