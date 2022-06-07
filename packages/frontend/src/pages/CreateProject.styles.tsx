import { Button, Card, Colors, H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
import { BigButton } from '../components/common/BigButton';
import SimpleButton from '../components/common/SimpleButton';

export const CreateProjectWrapper = styled.div`
    display: flex;
    width: 100vw;
    flex-direction: column;
    flex: 1;
`;

export const CreateHeaderWrapper = styled.div`
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

export const BackToWarehouseButton = styled(SimpleButton)`
    width: fit-content;
    padding-left: 0;
    margin-bottom: 10px;
`;

export const ExternalLink = styled.a`
    color: ${Colors.BLUE3};
`;
