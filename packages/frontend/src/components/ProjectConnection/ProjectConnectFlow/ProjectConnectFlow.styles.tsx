import { Colors, H3, Icon, NonIdealState } from '@blueprintjs/core';
import styled, { keyframes } from 'styled-components';

export const Wrapper = styled.div`
    width: 400px;
    display: flex;
    flex-direction: column;
    flex: 1;
    margin: 80px auto 0;
    position: relative;
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
