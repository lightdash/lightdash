import { Button, Icon } from '@blueprintjs/core';
import styled from 'styled-components';

export const ColumnConfigurationWrapper = styled.div``;
export const ColumnWrapper = styled.div`
    display: grid;
    grid-template-columns: auto 35px auto;
    padding-bottom: 10px;
`;
export const FrozenIcon = styled(Icon)`
    padding: 7px;
    cursor: pointer;
`;

export const EyeButton = styled(Button)`
    margin-left: 5px;
`;
