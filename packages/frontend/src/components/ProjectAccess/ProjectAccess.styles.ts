import { Box, Center } from '@mantine/core';
import styled from 'styled-components';

export const ItemContent = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
`;
export const SectionWrapper = styled.div`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

export const UserInfo = styled.div`
    margin: 0;
    display: flex;
    flex-direction: column;
`;

export const UserName = styled.b`
    margin: 0;
    margin-right: 0.625em;
`;

export const ButtonGroup = styled.div`
    display: flex;
`;

export const LoadingArea = styled(Center)`
    display: flex;
    flex-direction: column;
`;

export const LoadingText = styled(Box)`
    font-weight: 700;
    color: #5f6b7c;
    font-size: 17px;
    margin-top: 7px;
`;

export const BadgeBox = styled(Box)`
    min-width: 50px;
    height: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 5.9px 8.9px;
    background: #8f99a826;
    color: black;
`;

export const EmailBox = styled(Box)`
    width: fit-content;
    border-radius: 2px;
    background: #8f99a826;
    color: #1c2127;
    margin-top: 0.3em;
`;
