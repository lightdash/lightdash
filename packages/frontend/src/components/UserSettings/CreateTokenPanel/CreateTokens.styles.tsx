import { Button, Callout, FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';
import SimpleButton from '../../common/SimpleButton';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import Select from '../../ReactHookForm/Select';

type SpaceProps = { horizontal?: boolean; vertical?: boolean; gap?: number };

export const Panel = styled.div`
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const BackButton = styled(SimpleButton)`
    align-self: flex-start;
    padding-left: 0;
    margin-bottom: 20px;
`;

export const AccessTokenForm = styled(Form)`
    display: flex;
    align-items: flex-start;
`;

export const TokeDescriptionInput = styled(Input)`
    flex: 1;
    margin: 0;
    .bp4-label {
        font-size: 12px;
        color: #5c7080;
    }
    .bp4-input-group {
        margin: 0;
    }
`;

export const SubmitButton = styled(Button)`
    margin: 21px 0 0 auto;
    width: 140px;
`;

export const InviteFormGroup = styled(FormGroup)`
    margin-top: 20px;
    margin-bottom: 0;
`;

export const ShareLinkCallout = styled(Callout)`
    margin-top: 10px;
`;

export const ExpireDateSelect = styled(Select)`
    margin: 20px 7px 0;
`;

export const InvitedCallout = styled(Callout)`
    margin-bottom: 10px;
`;

export const Space = styled.div`
    display: flex;
    flex-direction: ${(props: SpaceProps) =>
        props.horizontal ? 'row' : 'column'};
    gap: ${(props: SpaceProps) =>
        props.horizontal
            ? props.gap
                ? `0px ${props.gap}px`
                : `0px 5px`
            : props.gap
            ? `${props.gap}px 0px`
            : `5px 0px`};
`;
