import { Button } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

interface SortItemContainerProps {
    $marginTop: number;
}

export const SortItemContainer = styled.div<SortItemContainerProps>`
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-top: ${(props) => props.$marginTop}px;
`;

export const StyledPopover = styled(Popover2)``;

export const StretchDivider = styled.div`
    flex: 1;
`;

export const LabelWrapper = styled.div`
    flex-shrink: 0;
    text-wrap: nowrap;
    margin-right: 15px;
    display: flex;
    align-items: center;
`;

export const StyledXButton = styled(Button)`
    margin-left: 10px;
`;
