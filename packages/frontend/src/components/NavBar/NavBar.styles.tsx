import {
    Colors,
    HTMLSelect,
    Menu,
    MenuItem,
    Navbar,
    NavbarDivider,
} from '@blueprintjs/core';
import styled from 'styled-components';
import { ReactComponent as Logo } from '../../svgs/logo.svg';

export const NavBarWrapper = styled(Navbar)`
    position: sticky;
    top: 0;
`;

export const ProjectDropdown = styled(HTMLSelect)`
    margin: 0 1.143em 0 0;
    max-width: 300px;
`;

export const LogoContainer = styled(Logo)`
    margin-top: 0.143em;
    height: 2.143em;
    width: 6.429em;
`;

export const SpinnerWrapper = styled.div`
    padding: 0.714em;
    min-width: 6.429em;
`;

export const MenuWrapper = styled(Menu)`
    a[class~='bp4-selected'] {
        background: ${Colors.BLUE3} !important;
        color: ${Colors.WHITE} !important;

        svg,
        path {
            fill: ${Colors.WHITE} !important;
        }
    }
`;

export const FirstItem = styled(MenuItem)`
    margin-bottom: 0.357em;
`;

export const Divider = styled(NavbarDivider)`
    margin: 0 1.143em 0 0.429em;
`;
