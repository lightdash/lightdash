import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const SectionTitle = styled.p`
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    margin-bottom: 0.286em;
`;

export const InputTitle = styled.p`
    font-weight: 500;
    gap: 3px;
}
`;
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
