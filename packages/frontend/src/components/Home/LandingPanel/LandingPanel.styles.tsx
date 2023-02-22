import { Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';
import LinkButton from '../../common/LinkButton';

export const LandingHeaderWrapper = styled.div`
    display: flex;
    align-items: center;
    padding-top: 60px;
    margin-bottom: 35px;
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

export const StyledLinkButton = styled(LinkButton)`
    font-size: 14px !important;
`;
