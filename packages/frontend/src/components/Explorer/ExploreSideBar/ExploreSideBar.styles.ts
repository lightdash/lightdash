import { Menu, Switch } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import styled from 'styled-components';

export const FormField = styled.div`
    padding: 4px 0 12px;
`;

export const SwitchFilter = styled(Switch)`
    width: fit-content;
`;

export const MenuWrapper = styled(Menu)`
    flex: 1;
    overflow: auto;
    padding: 0;
`;

export const FooterWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const StyledBreadcrumb = styled(Breadcrumbs2)`
    flex-shrink: 0;
`;
