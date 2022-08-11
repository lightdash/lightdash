import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const WrapperAddTileButton = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    height: 5.286em;
    background: ${Colors.WHITE};
    padding: 2em;
    border-bottom: 0.071em solid #d8e1e8;
`;

export const TitleContainer = styled.div<{ $isEditing: boolean }>`
    display: flex;
    align-items: baseline;
    color: ${($isEditing) => ($isEditing ? Colors.GRAY1 : undefined)};
    overflow: hidden;
`;

export const Title = styled.p`
    color: ${Colors.GRAY1};
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
`;

export const EditContainer = styled.div`
    display: flex;
    align-items: center;
    align-content: center;
    justify-items: center;
    justify-content: center;
`;

export const ActionButton = styled(Button)`
    height: 1.429em;
    margin-left: 0.714em;
`;
