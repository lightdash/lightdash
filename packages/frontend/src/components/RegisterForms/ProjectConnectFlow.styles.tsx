import styled, { keyframes } from 'styled-components';
import MantineIcon from '../common/MantineIcon';

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

export const SuccessIconBounce = styled(MantineIcon)`
    animation-name: ${bounceIn};
    animation-duration: 0.7s;
`;
