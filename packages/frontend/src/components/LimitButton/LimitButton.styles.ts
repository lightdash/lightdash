import { Button, Colors, FormGroup } from '@blueprintjs/core';
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

export const GreyButton = styled(Button)`
    color: ${Colors.GRAY1};
`;
