import { Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const LandingPanelWrapper = styled.div`
    width: 54.857em;
    padding-top: 4.286em;
`;

export const LandingHeaderWrapper = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 2.5em;
`;

export const WelcomeText = styled.div`
    flex: 1;
`;

export const Title = styled(H3)`
    margin: 0 0 0.455em;
    color: ${Colors.BLACK};
`;

export const Intro = styled.p`
    color: ${Colors.GRAY1};
`;
