import { Colors, InputGroup } from '@blueprintjs/core';
import { Omnibar } from '@blueprintjs/select';
import styled from 'styled-components';
import { SearchItem } from './hooks';

export const SearchOmnibar = styled(Omnibar.ofType<SearchItem>())`
    width: 600px;
    left: calc(50% - 300px);
`;

export const SearchInput = styled(InputGroup)`
    margin-left: 10px;
    width: 148px;

    input {
        box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%),
            0 1px 2px rgb(17 20 24 / 20%) !important;
        border: 1px;
    }
`;

export const Hightlighed = styled.span`
    color: ${Colors.BLUE3};
`;

export const ResultContent = styled.div`
    display: flex;
    flex-direction: column;
    margin-left: 5px;
`;

export const FirstLine = styled.span`
    color: ${Colors.DARK_GRAY1};
`;

export const SecondLine = styled.span`
    color: ${Colors.GRAY3};
    font-size: 12px;
`;
