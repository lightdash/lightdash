import { Colors, FormGroup } from "@blueprintjs/core";
import styled from "styled-components";

export const InputWrapper = styled(FormGroup)`
    margin: 1.357em 0 0;
    & label.bp3-label {
        display: inline-flex;
        gap: 0.214em;
        color: ${Colors.DARK_GRAY1};
        font-weight: 600;
    }
`;
