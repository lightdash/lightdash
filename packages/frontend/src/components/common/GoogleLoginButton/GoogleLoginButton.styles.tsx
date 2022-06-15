import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';

export const GoogleLoginWrapper = styled.a`
    background: ${Colors.WHITE};
    width: 100%;
    height: 40px;
    border-radius: 3px;
    border: 1px solid ${Colors.LIGHT_GRAY3};
    color: ${Colors.DARK_GRAY1};
    text-align: center;
    display: flex;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
        Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
        sans-serif;
`;

export const LinkContent = styled.div`
    display: flex;
    width: fit-content;
    margin: auto;
`;

export const GoogleLogo = styled.img`
    margin-right: 10px;
    width: 20px;
`;
