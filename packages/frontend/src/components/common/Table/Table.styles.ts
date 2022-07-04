import { HTMLTable } from '@blueprintjs/core';
import styled from 'styled-components';

export const Table = styled(HTMLTable)`
    width: 100%;

    thead {
        position: sticky;
        top: 50px;
        inset-block-start: 50px; /* "top" */
        background: #eee;
    }

    tfoot {
        position: sticky;
        bottom: 0;
        inset-block-end: 0; /* "bottom" */
        background: #eee;
    }
`;
