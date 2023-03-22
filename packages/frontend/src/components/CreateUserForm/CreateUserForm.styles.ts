import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import { BigButton } from '../common/BigButton';

export const SubmitButton = styled(BigButton)`
    width: 100%;
`;

export const LinkButton = styled.button`
    color: ${Colors.BLUE3};
    border: none;
    background: none;

    &:hover {
        cursor: pointer;
        text-decoration: underline;
    }
`;

export const FormWrapper = styled.div`
    margin: 10px 30px;
`;
