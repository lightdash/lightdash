import { Card, Colors, H5 } from '@blueprintjs/core';
import styled from 'styled-components';

export const Title = styled(H5)`
    tex-align: left;
    color: #ac2f33;
`;

export const Description = styled.p`
    tex-align: left;
    color: ${Colors.GRAY1};
    font-size: small;
`;

export const CardContainer = styled(Card)`
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 20px;
`;

export const PanelContent = styled.div`
    text-align: right;
    padding-top: 20px;
`;
