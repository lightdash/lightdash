import { HTMLSelect, Navbar } from '@blueprintjs/core';
import styled from 'styled-components';
import { ReactComponent as Logo } from '../../svgs/logo-icon.svg';

export const NAVBAR_HEIGHT = 50;

export const NavBarWrapper = styled(Navbar)`
    position: sticky;
    top: 0;
    height: ${NAVBAR_HEIGHT}px;
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
