import styled, { css } from 'styled-components';
import { BigButton } from '../common/BigButton';
import Input from '../ReactHookForm/Input';
import PasswordInput from '../ReactHookForm/PasswordInput';

const inputFieldStyles = css`
    margin-bottom: 20px;
    input {
        height: 40px;
    }
`;

export const InputField = styled(Input)`
    ${inputFieldStyles}
`;

export const InputsGroup = styled.div`
    display: flex;
    flex-direction: row;
    gap: 10px;
`;

export const PasswordInputField = styled(PasswordInput)`
    ${inputFieldStyles}
    .bp4-input-group .bp4-input-action {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
    }
`;

export const SubmitButton = styled(BigButton)`
    width: 100%;
`;
