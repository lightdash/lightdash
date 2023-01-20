import { Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';
import BlueprintParagraph from '../../common/BlueprintParagraph';
import LinkButton from '../../common/LinkButton';

export const LandingPanelWrapper = styled.div`
    width: 100%;
    padding-top: 60px;
`;

export const LandingHeaderWrapper = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 40px;
`;

export const WelcomeText = styled.div`
    flex: 1;
`;

export const Title = styled(H3)`
    margin: 0 0 0.455em;
    color: ${Colors.BLACK};
`;

export const Intro = styled(BlueprintParagraph)`
    color: ${Colors.GRAY1};
`;

export const StyledLinkButton = styled(LinkButton)`
    font-size: 14px !important;
`;
