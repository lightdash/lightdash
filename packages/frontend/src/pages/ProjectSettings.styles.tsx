import { H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const UpdateProjectWrapper = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
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
