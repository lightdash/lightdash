import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const ColumnConfigurationWrapper = styled.div`
    background: ${Colors.LIGHT_GRAY5};
    padding: 10px;
`;
export const ColumnWrapper = styled.div`
    display: grid;
    grid-template-columns: auto 30px;
`;
