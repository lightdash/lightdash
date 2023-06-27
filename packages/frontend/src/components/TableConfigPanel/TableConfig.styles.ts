import { Button, Colors, FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const ConfigWrapper = styled(FormGroup)`
    width: 320px;
    & label.bp4-label {
        display: inline-flex;
        gap: 0.214em;
        color: ${Colors.DARK_GRAY1};
        font-weight: 600;
    }
`;

export const AddPivotButton = styled(Button)`
    margin-bottom: 0.286em;
`;
