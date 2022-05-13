import { Spinner } from '@blueprintjs/core';
import styled from 'styled-components';
import { BigButton } from '../common/BigButton';

export const RefreshSpinnerButton = styled.div`
    display: flex;
    flex-direction: row;
    white-space: nowrap;
`;

export const LoadingSpinner = styled(Spinner)`
    margin-right: 5px;
`;

export const RefreshButton = styled(BigButton)`
    width: 150px;
    margin-left: 10px;
    white-space: nowrap;
`;
