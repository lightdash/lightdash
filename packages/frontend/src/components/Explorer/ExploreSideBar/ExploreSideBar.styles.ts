import { Menu, Switch } from '@blueprintjs/core';
import styled from 'styled-components';

export const SideBarTitleWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
`;

export const SideBarDescription = styled.div`
    padding: 0.625em;
`;

export const SwitchFilter = styled(Switch)`
    margin: 1.25em 0 0.625em;
    width: fit-content;
`;

export const MenuWrapper = styled(Menu)`
    flex: 1;
    overflow: auto;
`;

export const FooterWrapper = styled.div`
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;
