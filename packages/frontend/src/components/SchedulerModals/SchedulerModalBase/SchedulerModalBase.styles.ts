import { Card, H5, HTMLSelect } from '@blueprintjs/core';
import { IconMail } from '@tabler/icons-react';
import styled from 'styled-components';
import { ReactComponent as SlackSvg } from '../../../svgs/slack.svg';

export const SlackIcon = styled(SlackSvg)`
    width: 20px;
    height: 20px;
    margin: 5px;
`;
export const EmailIcon = styled(IconMail)`
    margin: 5px;
`;
export const TargetRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 5px;

    margin-bottom: 10px;

    .bp4-form-group {
        margin-bottom: 0;
        flex: 1;
    }
`;

export const SchedulerContainer = styled(Card)`
    display: flex;
    flex-direction: column;
    padding: 5px 10px 11px;
    margin-bottom: 10px;
`;

export const SchedulerName = styled(H5)`
    font-size: 14px !important;
    flex: 1;
    margin: 0;
`;

export const SchedulerDetailsContainer = styled.div`
    display: flex;
    align-items: center;
`;

export const Title = styled.p`
    margin: 8px 0px;
    font-weight: 600;
`;

export const ModalTitle = styled.p`
    margin: 3px 0px;
`;

export const StyledSelect = styled(HTMLSelect)`
    margin-bottom: 10px;
`;

export const InputWrapper = styled.div`
    width: 130px;
    margin-bottom: 10px;
`;

export const InputGroupWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;
