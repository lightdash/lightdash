import { Button, Card, H5, Menu } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

const Layout = css`
    width: 800px;
    margin: auto;
`;

export const CardContainer = styled(Card)`
    ${Layout}
    display: grid;
    grid-template-columns: 1fr 1fr;
`;

export const ContentWrapper = styled.div`
    ${Layout}
`;

export const Title = styled(H5)`
    tex-align: left;
`;

export const ExpandableWrapper = styled.div`
    box-shadow: none;
    padding: 0 5px 0 2px;
    margin-top: 12px;
`;

export const SettingsItems = styled.div`
    padding-left: 27px;
`;
export const CollapseTrigger = styled(Button)`
    font-weight: 600;
    padding-left: 0;
    width: 100%;

    :focus {
        outline: none;
    }
    .bp4-button-text {
        margin-right: auto;
    }
`;

export const SidebarMenu = styled(Menu)`
    padding-left: 0;
`;
