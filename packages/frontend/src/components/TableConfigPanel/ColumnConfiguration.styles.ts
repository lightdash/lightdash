import { Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const ColumnConfigurationWrapper = styled.div`
    background: ${Colors.LIGHT_GRAY5};
    padding: 10px;
`;
export const ColumnWrapper = styled.div`
    display: grid;
    grid-template-columns: auto 30px;
`;

export const ColumnTitle = styled.p`
    color: ${Colors.DARK_GRAY1};
    font-weight: 600;
    padding: 8px;
`;

export const ConfigButton = styled(Button)`
    width: 30px;
    height: 30px;
`;
