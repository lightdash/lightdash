import { H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

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

export const Title = styled(H3)<{ marginBottom?: boolean }>`
    margin: 0;

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
