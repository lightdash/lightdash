import EChartsReact from 'echarts-for-react';
import styled from 'styled-components';

export const ChartWrapper = styled.div`
    height: 100%;
`;

export const Chart = styled(EChartsReact)`
    height: 100% !important;
    max-height: 300px;
    width: 100%;
`;
