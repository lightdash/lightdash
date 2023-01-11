import { Button, Collapse, Colors } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

export const DeleteButtonTooltip = styled(Tooltip2)`
    margin-left: auto;
`;

export const CollapseWrapper = styled(Collapse)<{ isOpen: boolean }>`
    background-color: ${Colors.LIGHT_GRAY5};

    ${({ isOpen }) => (isOpen ? 'padding:10px 10px 5px 10px;' : '')}
`;
