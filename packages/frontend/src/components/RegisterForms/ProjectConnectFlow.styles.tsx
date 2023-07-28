import { Icon } from '@blueprintjs/core';
import styled, { keyframes } from 'styled-components';

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
