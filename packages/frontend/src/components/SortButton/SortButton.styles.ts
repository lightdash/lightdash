import { Popover2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

export const StyledPopover = styled(Popover2)`
    .bp4-popover2-content {
        display: flex;
        flex-direction: column;
        min-width: 300px;
        max-width: 500px;
    }
`;

export const SortItemContainer = styled.div`
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
`;

export const StretchDivider = styled.div`
    flex: 1;
`;

export const LabelWrapper = styled.div`
    flex-shrink: 0;
    margin-right: 15px;
    display: flex;
    align-items: center;
`;
