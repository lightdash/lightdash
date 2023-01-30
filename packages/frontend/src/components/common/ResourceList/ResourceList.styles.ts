import { Card, Colors, H3, H4, Icon, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

const paddingX = 20;

export const ResourceListContainer = styled(Card)`
    width: 768px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow: hidden;
    padding: 0;
`;

export const ResourceListHeader = styled.div`
    display: flex;
    align-items: center;
    width: 100%;
    padding: 12px ${paddingX}px;
    gap: 10px;
    border-bottom: 1px solid ${Colors.LIGHT_GRAY2};
`;

export const Spacer = styled.div`
    flex: 1 0 auto;
`;

export const ResourceBreadcrumbTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const ResourceTitle = styled(H3)`
    flex: 0 0 auto;
    margin: 0;
    color: ${Colors.DARK_GRAY1};
    font-size: 16px !important;
    font-weight: 600;
`;

export const ResourceTag = styled(Tag)`
    font-weight: bold;
    background-color: ${Colors.LIGHT_GRAY2};
    color: ${Colors.DARK_GRAY1};
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
