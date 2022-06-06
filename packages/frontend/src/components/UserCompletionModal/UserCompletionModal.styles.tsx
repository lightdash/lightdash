import { Card, Colors, H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
import { BigButton } from '../common/BigButton';
import Input from '../ReactHookForm/Input';
import Select from '../ReactHookForm/Select';

const inputFieldStyles = css`
    margin-bottom: 20px;
    input {
        height: 40px;
    }
`;

export const UserCompletionModalCard = styled(Card)`
    padding: 30px 27px;
    display: flex;
    flex-direction: column;
    top: 50%;
    transform: translate(-50%, -50%);
    left: 50%;
`;

export const Title = styled(H3)`
    text-align: center;
`;

export const Subtitle = styled.p`
    color: ${Colors.GRAY2};
    text-align: center;
    margin-bottom: 20px;
`;

export const InputField = styled(Input)`
    ${inputFieldStyles}
`;

export const InputSelect = styled(Select)`
    margin-bottom: 20px;
    select {
        height: 40px;
        background: ${Colors.WHITE};
        border: 0.7px solid #d3d8de;
        box-shadow: inset 0px 1px 1px rgba(16, 22, 26, 0.2);
    }

    .bp4-select::after,
    .bp4-html-select .bp4-icon,
    .bp4-select .bp4-icon {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
    }
`;

export const SubmitButton = styled(BigButton)`
    width: 100%;
`;
