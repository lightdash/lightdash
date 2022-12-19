import { Card, Colors, H5 } from '@blueprintjs/core';
import styled, { createGlobalStyle } from 'styled-components';

interface HeaderContainerProps {
    isEditMode: boolean;
    isHovering?: boolean;
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
    min-height: 80px;
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

export const TitleWrapper = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
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

export const FilterLabel = styled.span`
    color: ${Colors.GRAY2};
    font-weight: 500;
    font-size: 0.857em;
    line-height: 1.583em;
    margin: 0.5em 0 1em;
`;

export const ChartContainer = styled.div`
    flex: 1;
    overflow: hidden;
    display: flex;
`;
