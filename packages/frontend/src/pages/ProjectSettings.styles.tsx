import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import { BigButton } from '../components/common/BigButton';

export const ContentContainer = styled.div`
    width: 800px;
    margin: 0 auto;
`;

export const SubtitleWrapper = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 20px;
`;

export const Subtitle = styled.p`
    color: ${Colors.GRAY2};
    margin: 0px;
`;

export const ProjectConnectionContainer = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100vw;
    height: calc(100vh - 50px) !important;
`;

export const ButtonsWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

export const SaveButton = styled(BigButton)`
    width: 170px;
`;

export const TabsWrapper = styled.div`
    margin: 30px 0 20px 0;
`;
