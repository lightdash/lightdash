import { Button, Card, Colors, H5, Tag } from '@blueprintjs/core';
import styled from 'styled-components';

export const OpenShareModal = styled(Button)`
    margin-right: 10px;
`;
export const FlexWrapper = styled.div`
    display: flex;
    margin-bottom: 10px;
`;

export const ShareButton = styled(Button)`
    width: 100px;
    margin-left: 10px;
`;

export const ShareTag = styled(Tag)`
    width: 30px;
    padding: 0 0 0 8px !important;
    text-align: center;
    background-color: lightgray;
`;

export const Hightlighed = styled.span`
    color: ${Colors.BLUE3};
`;

export const AccessName = styled.p`
    flex: auto;
    margin: 5px 0px 0 10px;
`;

export const AccessRole = styled.div`
    flex: 2;
    text-align: right;
`;
