import { H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
import { BigButton } from '../components/common/BigButton';

export const ContentContainer = styled.div`
    width: 800px;
    margin: 0 auto;
`;

export const Header = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
`;

export const TitleWrapper = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    flex: 1;
    justify-content: flex-start;
`;

export const Title = styled(H3)<{ marginBottom?: boolean }>`
    margin: 0;
    margin-right: 10px;

    ${({ marginBottom }) =>
        marginBottom &&
        css`
            margin: 0 0 20px;
        `}
`;

export const ProjectConnectionContainer = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100vw;
    height: calc(100vh - 50px) !important;
`;

export const ButtonsWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

export const SaveButton = styled(BigButton)`
    width: 170px;
`;

export const TabsWrapper = styled.div`
    margin: 30px 0 20px 0;
`;
