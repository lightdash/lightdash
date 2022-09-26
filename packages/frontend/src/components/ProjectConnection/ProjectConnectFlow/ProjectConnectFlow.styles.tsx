import {
    Button,
    Card,
    Colors,
    H3,
    Icon,
    NonIdealState,
    Radio,
} from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const Wrapper = styled.div`
    width: 400px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    margin: 50px auto 0;
`;

export const ConnectWarehouseWrapper = styled(Card)`
    padding: 30px 20px;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    text-align: center;
`;

export const StyledSuccessIcon = styled(Icon)`
    margin: 20px 0;

    svg {
        display: inline-block;
    }
`;

export const StyledNonIdealState = styled(NonIdealState)`
    margin-top: 30px;

    svg {
        fill-opacity: unset !important;
    }
`;

export const Title = styled(H3)<{ marginBottom?: boolean }>`
    margin: 0;
    ${({ marginBottom }) =>
        marginBottom &&
        css`
            margin: 0 0 20px;
        `}
`;

export const Subtitle = styled.p`
    color: ${Colors.GRAY2};
    margin: 5px 0 20px 0;
`;

export const WarehouseGrid = styled.div`
    margin: 28px 0 20px;
    display: grid;
    grid-template-columns: auto auto;
    gap: 10px;
`;

export const WarehouseButton = styled(Button)`
    padding: 5px 12px;
    height: 50px;
    justify-content: flex-start;
    font-weight: 600;
`;

export const WarehouseIcon = styled.img`
    margin-right: 8px;
    width: 25px;
`;

export const ExternalLink = styled.a`
    color: ${Colors.BLUE3};
`;

export const RadioButton = styled(Radio)`
    text-align: left;
`;

export const Codeblock = styled.div`
    padding: 8px 12px;
    margin-bottom: 8px;
    background: #ebf1f5;
    width: 100%;
    border-radius: 3px;
    text-align: initial;

    pre {
        margin: 0;
        color: ${Colors.GRAY1};
        white-space: pre-wrap;
    }
`;

export const ButtonsWrapper = styled.div`
    margin: 10px 0;
`;
