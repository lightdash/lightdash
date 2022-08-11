import { Colors, H3, Icon } from '@blueprintjs/core';
import styled from 'styled-components';

export const PageTitle = styled(H3)`
    margin: 0 5px 0 0;
`;

export const PageTitleContainer = styled.div`
    display: flex;
    align-items: center;
`;

export const PageDetailsContainer = styled.div`
    margin-top: 0.38em;
    display: flex;
    align-items: center;
    color: ${Colors.GRAY2};
    font-size: 12px;
    font-weight: 400;
    line-height: 14px;
`;

export const SeparatorDot = styled(Icon)`
    margin-left: 11px;
    margin-right: 11px;
    color: ${Colors.GRAY2};
`;

export const IconWithRightMargin = styled(Icon)`
    margin-right: 4px;
    color: ${Colors.GRAY2};
`;

export const PageTitleAndDetailsContainer = styled.div``;
