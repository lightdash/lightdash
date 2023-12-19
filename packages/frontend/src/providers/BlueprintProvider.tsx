// FIXME: remove after blueprint migration is complete
import './../styles/blueprint-core.css';

import { Colors } from '@blueprintjs/core';
import { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

const GlobalBlueprintStyles = createGlobalStyle`
    .bp4-input {
        border: 0.7px solid ${Colors.LIGHT_GRAY1};
        box-shadow: inset 0px 1px 1px rgba(16, 22, 26, 0.2);
    }

    .bp4-input::placeholder {
        color: ${Colors.GRAY3};
    }

    .ace_editor.ace_autocomplete {
        width: 500px;
    }
`;

export const BlueprintProvider: FC = ({ children }) => {
    return (
        <>
            <GlobalBlueprintStyles />
            {children}
        </>
    );
};
