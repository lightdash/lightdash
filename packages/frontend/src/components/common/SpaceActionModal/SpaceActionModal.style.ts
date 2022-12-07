import { Button, Colors } from '@blueprintjs/core';
import styled, { css } from 'styled-components';

export const RadioDescription = styled.p`
    color: ${Colors.GRAY3};
    margin: -5px 0px 10px 25px;
`;

export const ShareSpaceWrapper = styled.div`
    gap: 20px;
    flex: 1;
    display: flex;
    flex-direction: column;
`;
export const AddUserLabel = styled.span``;

const commonTagStyle = css`
    width: 35px;
    height: 35px;
    border-radius: 100%;
    display: flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
`;

export const ShareCircle = styled.div`
    ${commonTagStyle}
    background-color: ${Colors.LIGHT_GRAY2};
    color: ${Colors.GRAY1};
`;
