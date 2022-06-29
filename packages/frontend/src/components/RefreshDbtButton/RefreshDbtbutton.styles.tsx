import { Spinner, Tag } from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../common/SimpleButton';

export const LoadingSpinner = styled(Spinner)`
    margin-right: 5px;
`;

export const RefreshDbt = styled(SimpleButton)`
    padding-left: 0;
`;

export const PreviewTag = styled(Tag)`
    height: 40px;
`;
