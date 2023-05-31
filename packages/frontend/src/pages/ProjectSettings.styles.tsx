import styled from 'styled-components';
import { BigButton } from '../components/common/BigButton';

export const ButtonsWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

export const SaveButton = styled(BigButton)`
    width: 170px;
`;
