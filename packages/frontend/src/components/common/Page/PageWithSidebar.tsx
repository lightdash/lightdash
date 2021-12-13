import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

const PageWithSidebar = styled('div')`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: stretch;
    align-items: flex-start;
    background: ${Colors.LIGHT_GRAY4};
`;

export default PageWithSidebar;
