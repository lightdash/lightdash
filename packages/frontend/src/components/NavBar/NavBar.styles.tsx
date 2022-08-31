import { Colors, HTMLSelect, Navbar, NavbarDivider } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import styled from 'styled-components';
import { ReactComponent as Logo } from '../../svgs/logo-icon.svg';

export const NavBarWrapper = styled(Navbar)`
    position: sticky;
    top: 0;
`;

export const ProjectDropdown = styled(HTMLSelect)`
    margin: 0 1.143em 0 0;
    max-width: 300px;

    select {
        background-color: rgba(17, 20, 24, 0.3) !important;
    }
`;

export const LogoContainer = styled(Logo)`
    height: 30px;
    width: 30px;
`;

export const SpinnerWrapper = styled.div`
    padding: 0.714em;
    min-width: 6.429em;
`;

export const NavbarMenuItem = styled(MenuItem2)`
    ${({ active }) =>
        active
            ? `
                background: ${Colors.BLUE3} !important;
                color: ${Colors.WHITE} !important;

                svg,
                path {
                    fill: ${Colors.WHITE} !important;
                }
            `
            : ''}
`;

export const FirstItem = styled(NavbarMenuItem)`
    margin-bottom: 0.357em;
`;

export const Divider = styled(NavbarDivider)`
    margin: 0 10px 0 6px;
`;
