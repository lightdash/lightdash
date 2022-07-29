import { Omnibar } from '@blueprintjs/select';
import styled from 'styled-components';
import { SearchItem } from './hooks';

export const SearchOmnibar = styled(Omnibar.ofType<SearchItem>())`
    width: 600px;
    left: calc(50% - 300px);
`;
