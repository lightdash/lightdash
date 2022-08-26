import { Divider, Menu } from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../../common/SimpleButton';

export const LoadingStateWrapper = styled(Menu)`
    flex: 1;
`;

export const BackButton = styled(SimpleButton)`
    align-self: flex-start;
    padding-left: 0;
`;

export const TableDivider = styled(Divider)`
    margin: 12px 0 18px 0;
`;
