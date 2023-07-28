import { Colors, Icon } from '@blueprintjs/core';
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

export const FormFooterCopy = styled.p`
    width: 400px;
    margin: 35px auto 0;
    color: ${Colors.GRAY2};
    text-align: center;
`;
