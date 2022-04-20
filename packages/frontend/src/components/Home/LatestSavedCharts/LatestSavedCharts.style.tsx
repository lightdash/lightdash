import { Colors } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
import LinkButton from '../../common/LinkButton';

const ButtonStyle = css`
    width: 100%;
    justify-content: left;
`;

export const ChartName = styled(LinkButton)`
    ${ButtonStyle}
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    height: 60px;
    padding: 10px;
    line-height: 18px;
`;

export const CreateChartButton = styled(LinkButton)`
    ${ButtonStyle}
    font-weight: 500;
`;

export const ViewAllButton = styled(LinkButton)`
    color: ${Colors.BLUE3} !important;
    width: 7.143em;
`;
