import { Card, Colors, H3 } from '@blueprintjs/core';
import styled, { css } from 'styled-components';
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
    width: 130px;
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
    .bp4-input-group .bp4-input-action {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
    }
`;

export const Title = styled(H3)`
    text-align: center;
    margin-bottom: 25px;
`;

export const SubmitButton = styled(BigButton)`
    width: 100%;
`;

export const AnchorLinkWrapper = styled.div`
    text-align: center;
    margin-top: 20px;
    font-weight: 500;
    color: ${Colors.BLUE3};
`;

export const DividerWrapper = styled.div`
    margin: 20px 0;
    display: flex;
    flex-direction: row;
    gap: 15px;
    color: ${Colors.GRAY4};
    align-items: center;
`;

export const Divider = styled.span`
    display: block;
    width: 100%;
    height: 1px;
    background: ${Colors.LIGHT_GRAY3};
`;

export const FormFooterCopy = styled.p`
    color: ${Colors.GRAY2};
    margin-top: 25px;
    text-align: center;
`;

export const FooterCta = styled.a`
    color: ${Colors.BLUE3};
`;
