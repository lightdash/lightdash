import { Colors, H3, H4, Icon } from '@blueprintjs/core';
import styled from 'styled-components';

export const Title = styled(H3)`
    margin-top: 10px;
    margin-bottom: 30px;
    text-align: left;
    font-size: 22px !important;
`;

export const SpacePanelWrapper = styled.div`
    .bp4-card:last-child {
        margin-top: 20px;
    }

    .home-breadcrumb {
        color: ${Colors.BLUE3};
    }
    h3 {
        font-size: 18px;
    }
`;

export const EmptyStateWrapper = styled.div`
    max-width: 250px;
`;

export const EmptyStateIcon = styled(Icon)`
    path {
        fill: ${Colors.LIGHT_GRAY3};
    }
`;
export const EmptyStateText = styled(H4)`
    margin: 18px auto;
`;
