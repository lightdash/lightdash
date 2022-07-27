import { Omnibar } from '@blueprintjs/select';
import { SearchResult } from '@lightdash/common';
import styled from 'styled-components';

export const SearchOmnibar = styled(Omnibar.ofType<SearchResult>())`
    width: 600px;
    left: calc(50% - 300px);
`;
