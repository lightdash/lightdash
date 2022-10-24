import { Button, Colors, FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConfigWrapper = styled(FormGroup)`
    max-width: 28.571em;
    width: 25em;
    padding: 1.429em 1.429em;
    margin: 0;
    & label.bp4-label {
        display: inline-flex;
        gap: 0.214em;
        color: ${Colors.DARK_GRAY1};
        font-weight: 600;
    }
`;

export const SectionTitle = styled.p`
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    margin-bottom: 0.286em;
`;

export const AddPivotButton = styled(Button)`
    margin-bottom: 0.286em;
`;
