import { Card, H4 } from '@blueprintjs/core';
import styled from 'styled-components';
import BlueprintParagraph from '../../common/BlueprintParagraph';

export const CardWrapper = styled.div`
    height: fit-content;
    display: flex;
    flex-direction: column;
`;

export const CardContainer = styled(Card)`
    display: flex;
    align-items: center;
    margin-bottom: 20px;
`;

export const Text = styled(BlueprintParagraph)`
    margin: 0;
    margin-right: 10px;
    flex: 1;
`;

export const Bold = styled.b`
    margin: 0;
    margin-right: 10px;
`;

export const Title = styled(H4)`
    margin-bottom: 30px;
`;

export const GoogleButtonWrapper = styled.div`
    width: 300px;
`;
