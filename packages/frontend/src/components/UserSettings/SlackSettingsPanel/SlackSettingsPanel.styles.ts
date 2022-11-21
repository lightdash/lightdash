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

export const ColorSquare = styled.div`
    height: 30px;
    width: 30px;
    padding: 0.286em;
`;

export const ColorSquareInner = styled.div`
    height: 100%;
    width: 100%;
    border-radius: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

export const SaveButton = styled(Button)`
    margin-top: 40px;
    align-self: flex-end;
`;
