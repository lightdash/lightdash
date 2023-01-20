import { Colors } from '@blueprintjs/core';
import styled from 'styled-components';
import BlueprintParagraph from '../../common/BlueprintParagraph';

export const Tooltip = styled(BlueprintParagraph)`
    padding: 0;
    margin: 0;
`;

export const FilterValues = styled.span`
    font-weight: 700;
`;

export const DisabledFilterHeader = styled(BlueprintParagraph)`
    margin: 0;
    color: ${Colors.GRAY2};
`;
