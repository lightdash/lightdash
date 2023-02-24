import { Colors, H4, Icon, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const ResourceBreadcrumbTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const ResourceEmptyStateWrapper = styled.div`
    padding: 40px 0;
    display: flex;
    gap: 18px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
`;

export const ResourceEmptyStateIcon = styled(Icon)`
    path {
        fill: ${Colors.LIGHT_GRAY1};
    }
`;

export const ResourceEmptyStateHeaderWrapper = styled.div`
    display: flex;
    gap: 10px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
`;

export const ResourceEmptyStateHeader = styled(H4)`
    margin: 0;
`;

export const ResourceEmptyStateText = styled.span`
    color: ${Colors.GRAY1};
`;
