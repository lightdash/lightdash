import { AnchorButton, Colors } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

export const TriggerWrapper = styled(Popover2)`
    width: fit-content;
`;

export const FilterTrigger = styled(AnchorButton)`
    color: ${Colors.BLUE4} !important;
    & span[icon='filter-list'] {
        & svg path {
            fill: ${Colors.BLUE4} !important;
        }
    }

    :hover {
        background: transparent !important;
    }
`;
