import { Colors, FormGroup } from '@blueprintjs/core';
import styled from 'styled-components';
import BlueprintParagraph from '../common/BlueprintParagraph';

export const FormGroupWrapper = styled(FormGroup)`
    font-weight: bold;
`;

export const CreateNewText = styled(BlueprintParagraph)`
    font-weight: bold;
    color: ${Colors.BLUE3};
    cursor: pointer;
    margin-top: 1em;
`;
