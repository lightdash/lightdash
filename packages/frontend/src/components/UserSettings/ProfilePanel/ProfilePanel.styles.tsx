import { Colors, Icon } from '@blueprintjs/core';
import { Text } from '@mantine/core';
import styled from 'styled-components';

export const EmailVerificationCTA = styled(Text)`
    margin-top: 5px;
    color: ${Colors.GRAY1};
    font-size: 12px;
`;

export const EmailVerificationCTALink = styled.a`
    color: ${Colors.BLUE1};
    font-size: 12px;

    &:hover {
        text-decoration: underline;
    }
`;

export const EmailVerificationIcon = styled(Icon)`
    margin: 7.5px;
`;
