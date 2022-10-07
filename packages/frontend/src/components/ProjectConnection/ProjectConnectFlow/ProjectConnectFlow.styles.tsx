import {
    Button,
    Card,
    Colors,
    H3,
    Icon,
    NonIdealState,
    Radio,
} from '@blueprintjs/core';
import styled, { keyframes } from 'styled-components';

export const Wrapper = styled.div`
    width: 400px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    margin: 50px auto 0;
`;

export const ConnectWarehouseWrapper = styled(Card)`
    padding: 30px;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    text-align: center;
`;

const bounceIn = keyframes`
    0% {
        opacity: 0;
        transform: scale(.3);
    }
    50% {
        opacity: 1;
        transform: scale(1.05);
    }
    70% {
        transform: scale(.9);
    }
    100% {
        transform: scale(1);
    }
`;

export const StyledSuccessIcon = styled(Icon)`
    margin: 40px 0;
    animation-name: ${bounceIn};
    animation-duration: 0.7s;

    svg {
        display: inline-block;
    }
`;

export const StyledNonIdealState = styled(NonIdealState)`
    margin-top: 15px;

    svg {
        fill-opacity: unset !important;
    }
`;

export const Title = styled(H3)``;

export const Subtitle = styled.p`
    color: ${Colors.GRAY2};
    margin: 5px 0 20px 0;
`;

export const WarehouseGrid = styled.div`
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

export const RadioButton = styled(Radio)`
    text-align: left;
`;

export const CodeLabel = styled.p`
    text-align: left;
    color: ${Colors.GRAY1};
    margin-top: 10px;
    margin-bottom: 10px;
`;

export const Codeblock = styled.div`
    position: relative;
    margin-bottom: 8px;
    background: #ebf1f5;
    border-radius: 3px;
    text-align: initial;

    pre {
        margin: 0;
        padding: 10px 15px;
        color: ${Colors.GRAY1};
        overflow-x: scroll;
    }

    button {
        position: absolute;
        bottom: 10px;
        right: 10px;
    }
`;

export const ButtonsWrapper = styled.div`
    margin: 10px 0;
`;

export const FormFooterCopy = styled.p`
    width: 400px;
    margin: 35px auto 0;
    color: ${Colors.GRAY2};
    text-align: center;
`;

interface SpacerProps {
    $width?: number;
    $height?: number;
}

export const Spacer = styled.div<SpacerProps>`
    ${({ $width }) => $width && `width: ${$width}px;`}
    ${({ $height }) => $height && `height: ${$height}px;`}
`;
