import { Colors, Menu } from '@blueprintjs/core';
import styled from 'styled-components';
import LinkMenuItem from '../../common/LinkMenuItem';

export const LargeMenuItem = styled(LinkMenuItem)`
    align-items: stretch;

    .bp4-menu-item-icon {
        margin-right: 10px;
        height: unset !important;
    }

    > div {
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
`;

export const LargeMenuItemText = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: ${Colors.WHITE};
`;

export const LargeMenuItemSubText = styled.span`
    font-size: 13px;
    color: ${Colors.GRAY5};
`;

export const LargeMenuItemIconWrapper = styled.div`
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${Colors.GRAY1};
    border-radius: 2px;
`;
