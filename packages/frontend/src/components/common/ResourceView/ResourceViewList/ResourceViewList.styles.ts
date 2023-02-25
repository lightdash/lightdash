import { Colors, HTMLTable } from '@blueprintjs/core';
import styled from 'styled-components';

const paddingX = 20;

export const ResourceViewListTable = styled(HTMLTable)`
    width: 100%;
    border-collapse: collapse;
`;

export const ResourceViewListTHead = styled.thead`
    background-color: ${Colors.LIGHT_GRAY5};
`;

export const ResourceViewListTr = styled.tr`
    :hover {
        background-color: ${Colors.LIGHT_GRAY5}75;
    }
`;

export const ResourceViewListTBody = styled.tbody`
    ${ResourceViewListTr} {
        cursor: pointer;
    }

    ${ResourceViewListTr}:not(:last-child) {
        border-bottom: 1pt solid ${Colors.LIGHT_GRAY3} !important;
    }
`;

export const ResourceViewListTh = styled.th`
    vertical-align: middle !important;
    font-weight: 600 !important;
    font-size: 12px !important;
    color: ${Colors.GRAY1} !important;
    padding: 0 !important;
`;

interface ResourceViewListThInteractiveWrapperProps {
    $isInteractive: boolean;
}

export const ResourceViewListThInteractiveWrapper = styled.div<ResourceViewListThInteractiveWrapperProps>`
    padding: 7px ${paddingX}px !important;

    ${(props) =>
        props.$isInteractive
            ? `
                cursor: pointer;
                user-select: none;

                &:hover {
                    background-color: ${Colors.LIGHT_GRAY4};
                }
            `
            : ''}
`;

export const ResourceViewListTd = styled.td`
    vertical-align: middle !important;
    padding: 15px ${paddingX}px !important;
`;
