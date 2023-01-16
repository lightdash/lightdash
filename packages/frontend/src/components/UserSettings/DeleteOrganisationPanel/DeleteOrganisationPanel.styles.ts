import { Button, Card, Colors, H5, Menu } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const FormWrapper = styled.div`
    height: 100%;

    & form {
        height: 100%;
        display: flex;
        flex-direction: column;
    }
`;

export const Title = styled(H5)`
    tex-align: left;
    color: #ac2f33;
`;

export const Description = styled.p`
    tex-align: left;
    color: ${Colors.GRAY1};
    font-size: small;
`;

const Layout = css`
    width: 800px;
    margin: auto;
`;

export const CardContainer = styled(Card)`
    ${Layout}
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 20px;
`;

export const DeleteButton = styled(Button)``;

export const PanelContent = styled.div`
    text-align: right;
    padding-top: 20px;
`;
