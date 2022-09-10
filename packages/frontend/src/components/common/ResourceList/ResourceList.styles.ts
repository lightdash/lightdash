import { Card, Colors, H3, Tag } from '@blueprintjs/core';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const paddingX = 20;

export const ResourceListWrapper = styled(Card)`
    width: 768px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
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

export const Title = styled(H3)`
    flex: 0 0 auto;
    margin: 0;
    color: ${Colors.DARK_GRAY1};
`;

export const ResourceTag = styled(Tag)`
    font-weight: bold;
    background-color: ${Colors.LIGHT_GRAY2};
    color: ${Colors.DARK_GRAY1};
`;

export const ResourceLink = styled(Link)`
    font-size: 13px;
    font-weight: 600;
    color: ${Colors.DARK_GRAY4};

    &:hover {
        color: ${Colors.DARK_GRAY1};
    }
`;
