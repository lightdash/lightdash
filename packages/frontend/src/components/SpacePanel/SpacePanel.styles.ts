import { Colors, H4, Icon } from '@blueprintjs/core';
import styled from 'styled-components';

export const SpacePanelWrapper = styled.div`
    .bp4-card:last-child {
        margin-top: 20px;
    }

    h3 {
        font-size: 18px;
    }
`;

export const BreadcrumbsWrapper = styled.div`
    .bp4-breadcrumb {
        font-size: 22px;
        font-weight: 500;
    }
    .home-breadcrumb {
        color: #5c7080;
    }
    padding: 11px 0px 31px 0px;

    .bp4-breadcrumbs > li::after {
        margin-top: 5px;
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
