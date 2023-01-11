import { DateRangeInput2 } from '@blueprintjs/datetime2';
import styled from 'styled-components';

export const MultipleInputsWrapper = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    width: 100%;
`;

export const StyledDateRangeInput = styled(DateRangeInput2)`
    width: 100%;
    gap: 4px;

    .bp4-input-group {
        display: flex;
        flex: 1 1 50%;
        margin: 0 !important;
    }
`;
