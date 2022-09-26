import {
    Button,
    Card,
    Colors,
    H3,
    Icon,
    NonIdealState,
    Radio,
} from '@blueprintjs/core';
import styled, { css } from 'styled-components';
import { BigButton } from '../../common/BigButton';
import SimpleButton from '../../common/SimpleButton';
import Form from '../../ReactHookForm/Form';

export const Wrapper = styled.div`
    width: 400px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    margin: 50px auto 0;
`;

export const ConnectWarehouseWrapper = styled(Card)`
    padding: 30px;
    display: flex;
    flex-direction: column;
    text-align: center;
`;

export const StyledSuccessIcon = styled(Icon)`
    margin: 20px 0;

    svg {
        display: inline-block;
    }
`;

export const StyledNonIdealState = styled(NonIdealState)`
    margin-top: 30px;
`;

export const Title = styled(H3)<{ marginBottom?: boolean }>`
    margin: 0;
    ${({ marginBottom }) =>
        marginBottom &&
        css`
            margin: 0 0 20px;
        `}
`;

export const Subtitle = styled.p`
    color: ${Colors.GRAY2};
    margin: 5px 0 20px 0;
`;

export const WarehouseGrid = styled.div`
    margin: 28px 0 20px;
    display: grid;
    grid-template-columns: auto auto;
    gap: 10px;
`;

export const WarehouseButton = styled(Button)`
    padding: 5px 12px;
    height: 50px;
    justify-content: flex-start;
    font-weight: 600;
`;

export const WarehouseIcon = styled.img`
    margin-right: 8px;
    width: 25px;
`;

export const ExternalLink = styled.a`
    color: ${Colors.BLUE3};
`;

export const RadioButton = styled(Radio)`
    text-align: left;
`;

export const SubmitButton = styled(BigButton)`
    width: 100%;
`;

export const Codeblock = styled.div`
    padding: 12px 20px;
    margin-bottom: 10px;
    background: #ebf1f5;
    width: 100%;
    border-radius: 3px;
    text-align: initial;

    pre {
        margin: 0;
        color: ${Colors.GRAY1};
        white-space: pre-wrap;
    }
`;

export const ButtonsWrapper = styled.div`
    margin: 20px 0 10px;
`;

export const LinkToDocsButton = styled.a`
    padding: 21px 25px;
    width: 100%;
    border: 1px solid ${Colors.LIGHT_GRAY2};
    display: flex;
    justify-content: space-between;
    text-decoration: none;
    align-items: center;
    border-radius: 3px;
    margin-bottom: 10px;
    transition: all 0.3s ease;

    :hover {
        background: ${Colors.LIGHT_GRAY5};
        text-decoration: none;
        svg {
            transform: translateX(3px);
        }
    }

    svg path {
        fill: ${Colors.BLUE3};
    }
`;

export const ButtonLabel = styled.span`
    color: ${Colors.DARK_GRAY3};
    font-weight: 600;
`;

export const HasDimensionsForm = styled(Form)`
    margin-bottom: 10px;
    text-align: left;
`;

export const FormFooterCopy = styled.p`
    width: 400px;
    margin: 35px auto 0;
    color: ${Colors.GRAY2};
    text-align: center;
`;

export const InviteLinkButton = styled(SimpleButton)`
    width: fit-content;
    padding-left: 0;
`;
