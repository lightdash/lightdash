import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const SectionRow = styled.div`
    display: inline-flex;
    gap: 10px;
    width: 100%;

    > * {
        flex: 1;

        & label.bp4-label {
            font-weight: 600;
            display: inline-flex;
            gap: 0.214em;
            color: ${Colors.GRAY1};
            font-size: 0.857em;
        }
    }
`;
