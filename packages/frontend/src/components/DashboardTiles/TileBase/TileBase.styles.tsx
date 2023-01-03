import { Card, Colors, H5 } from '@blueprintjs/core';
import styled, { createGlobalStyle } from 'styled-components';

interface HeaderContainerProps {
    isEditMode: boolean;
    isHovering?: boolean;
}

interface TitleWrapperProps {
    hasDescription: boolean;
}

export const TileBaseWrapper = styled(Card)<HeaderContainerProps>`
    height: 100%;
    display: flex;
    flex-direction: column;

    ${(props) =>
        props.isEditMode && props.isHovering
            ? `
                box-shadow: 0 0 0 1px ${Colors.GRAY4};
            `
            : ''}
`;

export const HeaderContainer = styled.div<HeaderContainerProps>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 15px;
    flex-wrap: wrap;

    ${(props) =>
        props.isEditMode
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

export const TitleWrapper = styled.div<TitleWrapperProps>`
    display: flex;
    flex-direction: row;
    align-items: center;

    ${(props) =>
        props.hasDescription
            ? `
                &:hover { cursor: pointer }
            `
            : ''}
`;

export const Title = styled(H5)`
    margin: 0;
`;

export const HeaderWrapper = styled.div`
    display: flex;
    flex-direction: column;
    padding-top: 5px;
`;

export const ButtonsWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
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

export const FilterIcon = styled.div`
    border-radius: 2px;
    box-sizing: border-box;
    position: relative;
    color: ${Colors.GRAY1} !important;
    padding: 6px 7px;

    :hover {
        cursor: pointer;
        background: rgba(143, 153, 168, 0.15) !important;
    }
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
