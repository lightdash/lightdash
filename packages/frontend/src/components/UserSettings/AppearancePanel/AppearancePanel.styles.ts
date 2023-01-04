import { Button } from '@blueprintjs/core';
import styled from 'styled-components';

export const AppearancePanelWrapper = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const Title = styled.h3`
    margin: 0 0 10px;
`;
export const ColorPalette = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    column-gap: 40px;
`;

export const SaveButton = styled(Button)`
    margin-top: 40px;
    align-self: flex-end;
`;
