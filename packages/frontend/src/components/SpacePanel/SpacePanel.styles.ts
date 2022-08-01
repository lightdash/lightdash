import { Colors, H3 } from '@blueprintjs/core';
import styled from 'styled-components';

export const Title = styled(H3)`
    margin-top: 10px;
    margin-bottom: 30px;
    text-align: left;
`;

export const SpacePanelWrapper = styled.div`
    .bp4-card:last-child {
        margin-top: 20px;
    }

    .home-breadcrumb {
        color: ${Colors.BLUE3};
    }
`;
