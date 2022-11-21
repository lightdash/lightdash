import { AnchorButton, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const FilterTrigger = styled(AnchorButton)`
    color: ${Colors.BLUE3} !important;
    font-weight: 500;
    white-space: nowrap;
    & span[icon='filter-list'] {
        width: 12px;
        height: 12px;
        & svg {
            width: 12px;
            height: 12px;
            & path {
                fill: ${Colors.BLUE3} !important;
            }
        }
    }

    :hover {
        background: transparent !important;

        & span {
            text-decoration: underline;
        }
    }
    :focus,
    :active {
        outline: none;
        & span {
            text-decoration: underline;
        }
    }
`;

export const DashboardFilterWrapper = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
`;

export const Tooltip = styled.p`
    padding: 0;
    margin: 0;
`;
