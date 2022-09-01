import styled, { createGlobalStyle } from 'styled-components';

export const PopoverGlobalStyles = createGlobalStyle`
    .bp4-popover-portal-results-table-sort-fields .bp4-popover2-content {
        width: 400px;
        max-width: 400px !important;
        padding: 0 !important;
    }
`;

export const DroppableContainer = styled.div`
    display: flex;
    flex-direction: column;
    width: inherit;
    max-width: inherit;
    padding: 10px 15px;
`;

export const SortItemContainer = styled.div`
    width: 100%;
    flex: 1 0 auto;
    display: flex;
    align-items: center;
    user-select: none;
    margin: 6px 0;
`;

export const LabelWrapper = styled.div`
    flex: 0 0 60px;
`;

export const ColumnNameWrapper = styled.div`
    flex: 0 0 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 150px;
`;

export const StretchSpacer = styled.div`
    flex: 2 1 10px;
`;

export const Spacer = styled.div`
    flex: 0 0 auto;
    width: 6px;
`;
