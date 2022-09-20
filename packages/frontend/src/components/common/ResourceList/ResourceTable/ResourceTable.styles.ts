import { Colors, HTMLTable } from '@blueprintjs/core';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const paddingX = 20;

export const StyledTable = styled(HTMLTable)`
    width: 100%;
`;

export const StyledTHead = styled.thead`
    background-color: ${Colors.LIGHT_GRAY5};
`;

export const StyledTr = styled.tr`
    position: relative;

    :hover {
        background-color: ${Colors.LIGHT_GRAY5}75;
    }

    > td > *:not(a.full-row-link) {
        position: relative;
        z-index: 2;
    }
`;

export const StyledTBody = styled.tbody`
    ${StyledTr}:not(:last-child) {
        box-shadow: inset 0 -1px 0 0 ${Colors.LIGHT_GRAY3} !important;
    }
`;

export const StyledTh = styled.th`
    vertical-align: middle !important;
    font-weight: 600 !important;
    font-size: 12px !important;
    color: ${Colors.GRAY1} !important;
    padding: 0 !important;
`;

interface ThInteractiveWrapperProps {
    $isInteractive: boolean;
}

export const ThInteractiveWrapper = styled.div<ThInteractiveWrapperProps>`
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

export const StyledTd = styled.td`
    vertical-align: middle !important;
    padding: 12px ${paddingX}px !important;
`;

interface SpacerProps {
    $width: number;
}

export const Flex = styled.div`
    display: flex;
    align-items: center;
`;

export const Spacer = styled.div<SpacerProps>`
    width: ${(props) => props.$width}px;
`;

export const NoLinkContainer = styled.div`
    pointer-events: none;
`;

export const ResourceName = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: ${Colors.DARK_GRAY4};
`;

export const ResourceLink = styled(Link)`
    &.full-row-link {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1;
    }
`;

export const ResourceSpaceLink = styled(Link)`
    font-size: 13px;
    font-weight: 500;
    color: ${Colors.GRAY2};

    &:hover {
        color: ${Colors.GRAY1};
    }
`;
