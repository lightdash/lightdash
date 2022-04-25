import styled from 'styled-components';
import { BigButton } from '../../common/BigButton';

export const Wrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
`;

export const TitleWrapper = styled.div`
    flex: 1;
    justify-content: flex-start;
    display: flex;
    align-items: center;
    overflow: hidden;
    margin-right: 10px;
`;

export const OptionsButton = styled(BigButton)`
    height: 40px;
    width: 40px;
    margin-left: 10px;
`;
