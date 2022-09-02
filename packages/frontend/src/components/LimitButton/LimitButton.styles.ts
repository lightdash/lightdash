import { Button, FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';

export const PopupWrapper = styled(`div`)`
    display: flex;
    flex-direction: column;
    width: 200px;
`;

export const Label = styled(FormGroup)`
    white-space: nowrap;
`;

export const ApplyButton = styled(Button)`
    align-self: flex-end;
`;
