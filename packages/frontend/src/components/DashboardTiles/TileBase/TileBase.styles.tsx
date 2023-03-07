import { Card, Colors, H5 } from '@blueprintjs/core';
import styled, { createGlobalStyle } from 'styled-components';

interface HeaderContainerProps {
    $isEditMode: boolean;
    $isHovering?: boolean;
}

export const TileBaseWrapper = styled(Card)<HeaderContainerProps>`
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 16px;

    ${(props) =>
        props.$isEditMode && props.$isHovering
            ? `
                box-shadow: 0 0 0 1px ${Colors.GRAY4};
            `
            : ''}
`;

export const HeaderContainer = styled.div<HeaderContainerProps>`
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 12px;

    ${(props) =>
        props.$isEditMode
            ? `
                &:hover {
                    cursor: grab;
                }
                &:active, &:focus {
                    cursor: grabbing;
                }
            `
            : ''}
`;

export const GlobalTileStyles = createGlobalStyle`
  .react-draggable.react-draggable-dragging ${TileBaseWrapper} {
    box-shadow: 0 0 0 1px ${Colors.BLUE4};
  }
`;

export const TitleWrapper = styled.div`
    flex-grow: 1;
`;

export const ButtonsWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    gap: 8px;
`;

export const ChartContainer = styled.div`
    flex: 1;
    overflow: hidden;
    display: flex;
`;

export const TooltipContent = styled.p`
    max-width: 400px;
    margin: 0;
`;

export const FilterWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

export const FilterLabel = styled.p`
    margin-bottom: 5px;
    color: ${Colors.GRAY5};
    font-size: 12px;
    font-weight: 500;
`;

export const TileTitleLink = styled.a`
    font-weight: 600;
    font-size: 16px;
    color: ${Colors.DARK_GRAY1};

    &:hover {
        color: ${Colors.DARK_GRAY1};
    }

    &:not([href]) {
        cursor: default;
        text-decoration: none;
        :hover {
            text-decoration: none;
            color: ${Colors.DARK_GRAY1};
        }
    }
`;
