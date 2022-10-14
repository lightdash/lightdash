import { H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
import { BigButton } from '../components/common/BigButton';

export const ContentContainer = styled.div`
    width: 800px;
    margin: 0 auto;
`;

export const UpdateProjectWrapper = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: scroll;
`;

export const UpdateHeaderWrapper = styled.div`
    width: 800px;
    margin: 40px auto 0;
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
`;

export const SaveButton = styled(BigButton)`
    width: 170px;
`;
