import { AnchorButton, Button, Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import LinkButton from '../../common/LinkButton';
import SimpleButton from '../../common/SimpleButton';

export const ConfigureFilterWrapper = styled.div`
    width: 20.5em;
    height: 100%;
    display: flex;
    flex-direction: column;
`;

export const Title = styled.p`
    font-weight: bold;
    margin-bottom: 0;
`;

export const InputsWrapper = styled.div`
    display: flex;
    gap: 1.071em;
    width: 20.5em;
    flex-direction: column;

    select {
        width: 100% !important;
    }
`;

export const BackButton = styled(SimpleButton)`
    align-self: flex-start;
    font-size: 13px;
    padding: 0 !important;
`;

export const ApplyFilterButton = styled(Button)`
    margin: 1.714em 0 0 auto;
    justify-self: flex-end;
`;
