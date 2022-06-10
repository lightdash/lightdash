import { Card, Colors, H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
import AnchorLink from '../components/common/AnchorLink';
import { BigButton } from '../components/common/BigButton';
import Input from '../components/ReactHookForm/Input';
import PasswordInput from '../components/ReactHookForm/PasswordInput';

const inputFieldStyles = css`
    margin-bottom: 20px;
    input {
        height: 40px;
    }
`;

export const LogoWrapper = styled.div`
    margin: 30px auto;
`;

export const Logo = styled.img`
    width: 160px;
`;

export const FormWrapper = styled.div`
    width: 400px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
`;

export const CardWrapper = styled(Card)`
    padding: 30px 27px;
    display: flex;
    flex-direction: column;
`;

export const InputField = styled(Input)`
    ${inputFieldStyles}
`;

export const PasswordInputField = styled(PasswordInput)`
    ${inputFieldStyles}
    margin-top: 25px;
    .bp4-input-group .bp4-input-action {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
    }
`;

export const Title = styled(H3)`
    text-align: center;
`;

export const Subtitle = styled.p`
    text-align: center;
    color: ${Colors.GRAY2};
    margin: 0 0 25px;
`;

export const SubmitButton = styled(BigButton)`
    width: 100%;
`;

export const FormLink = styled(AnchorLink)`
    text-align: center;
    display: block;
    margin-top: 20px;
`;

export const List = styled.ul`
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    text-align: center;
    align-items: center;
`;

export const ListItem = styled.li`
    color: ${Colors.DARK_GRAY3};
    line-height: 1.5;
`;
