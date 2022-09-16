import { ButtonGroup, Colors } from '@blueprintjs/core';
import styled, { createGlobalStyle } from 'styled-components';

export const PopoverGlobalStyles = createGlobalStyle`
    .bp4-popover-portal-results-table-sort-fields .bp4-popover2-content {
        width: 430px;
        max-width: 430px !important;
        padding: 0 !important;
    }
`;

export const StyledButtonGroup = styled(ButtonGroup)`
    button {
        min-width: 60px !important;
        font-size: 12px;
    }

    button:disabled.bp4-intent-primary {
        background-color: ${Colors.BLUE1} !important;
        color: ${Colors.WHITE} !important;
    }
`;

export const DroppableContainer = styled.div`
    display: flex;
    flex-direction: column;
    width: inherit;
    max-width: inherit;
    padding: 10px;
`;

interface SortItemContainerProps {
    $isDragging: boolean;
}

export const SortItemContainer = styled.div<SortItemContainerProps>`
    width: 100%;
    flex: 1 0 auto;
    display: flex;
    align-items: center;
    user-select: none;
    padding: 6px;
    background-color: ${Colors.WHITE};
    border-radius: 3px;

    transition: box-shadow 0.5s ease-in-out;
    box-shadow: ${(props) =>
        props.$isDragging
            ? `0px 2px 6px ${Colors.GRAY1}52;`
            : `0px 0px 0px ${Colors.WHITE}`};
`;

export const LabelWrapper = styled.div`
    flex: 0 0 55px;
`;

export const ColumnNameWrapper = styled.div`
    flex: 0 0 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 150px;
    font-weight: bold;
`;

export const StretchSpacer = styled.div`
    flex: 2 1 10px;
`;

export const Spacer = styled.div<{ $width: number }>`
    flex: 0 0 ${(props) => props.$width}px;
`;
