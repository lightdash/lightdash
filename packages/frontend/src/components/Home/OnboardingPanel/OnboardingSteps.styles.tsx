import { AnchorButton, Card, Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const OnboardingPanelWrapper = styled.div`
    width: 54.857em;
    padding-top: 4.286em;
`;

export const Title = styled(H3)`
    text-align: left;
`;

export const Intro = styled.p`
    text-align: left;
    color: ${Colors.GRAY1};
`;

export const CardWrapper = styled(Card)`
    margin: 1.643em 0;
    padding: 3.143em;
`;

export const StepsWrapper = styled.ul`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    flex-direction: row;
    justify-content: space-between;
    padding: 0;
    margin: 0;
`;

export const StepContainer = styled.li`
    list-style: none;
    text-align: center;
`;

export const StepTitle = styled.p`
    font-weight: bold;
    font-size: 1.143em;
    line-height: 1.188em;
    margin-top: 1em;
    margin-bottom: 0;
`;
export const StepDescription = styled.p`
    font-size: 0.929em;
    line-height: 1.643em;
    color: ${Colors.GRAY2};
`;

export const ButtonWrapper = styled.div`
    width: 100%;
`;

export const CTA = styled(AnchorButton)`
    margin-top: 2.929em;
    background: ${Colors.BLUE3};
    font-weight: 500;
    width: 14.286em;
    height: 2.857em;
    margin-left: 50%;
    transform: translateX(-50%);
    border: none;
`;
