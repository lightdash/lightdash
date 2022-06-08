import { Button, Card, Colors, H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const Wrapper = styled.div`
    width: 400px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    margin: auto;
`;

export const ConnectWarehouseWrapper = styled(Card)`
    padding: 30px 27px;
    display: flex;
    flex-direction: column;
    text-align: center;
`;

export const Title = styled(H3)<{ marginBottom?: boolean }>`
    margin: 0;

    ${({ marginBottom }) =>
        marginBottom &&
        css`
            margin: 0 0 20px;
        `}
`;

export const Subtitle = styled.p`
    color: ${Colors.GRAY2};
    margin: 5px 0 0;
`;

export const WarehouseGrid = styled.div`
    margin: 28px 0 20px;
    display: grid;
    grid-template-columns: auto auto;
    gap: 10px;
`;

export const WarehouseButton = styled(Button)`
    padding: 5px 12px;
    height: 50px;
    justify-content: flex-start;
    font-weight: 600;
`;

export const WarehouseIcon = styled.img`
    margin-right: 8px;
`;

export const ExternalLink = styled.a`
    color: ${Colors.BLUE3};
`;
