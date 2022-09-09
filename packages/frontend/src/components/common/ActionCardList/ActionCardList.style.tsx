import { Card, Colors, Divider, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const ActionCardListWrapper = styled(Card)<{ $isHomePage?: boolean }>`
    width: 768px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;

    ${({ $isHomePage }) =>
        $isHomePage &&
        `
        width: 100%;
        padding: 0;
        box-shadow: none;
  `}
`;

export const HeaderCardListWrapper = styled.div`
    width: 100%;
    display: flex;
    align-items: flex-end;
`;

export const TitleWrapper = styled(H3)`
    flex: 1;
    margin: 0;
    color: ${Colors.GRAY1};
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const CardDivider = styled(Divider)`
    margin: 20px 0;
`;

export const ActionCardWrapper = styled.div`
    margin-bottom: 10px;
`;

export const NoIdealStateWrapper = styled.div`
    padding: 50px 0;
`;

export const SearchWrapper = styled.div`
    margin-bottom: 20px;
`;
