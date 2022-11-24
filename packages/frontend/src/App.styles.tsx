import { Colors } from '@blueprintjs/core';
import { createGlobalStyle } from 'styled-components';

const AppStyle = createGlobalStyle`
    .bp4-multi-select-tag-input-input::placeholder {
        color: ${Colors.GRAY3};
    }

    .bp4-dialog-container {
        padding-top: 110px; !important;
        align-items: flex-start !important;
    }

    .ace_editor.ace_autocomplete {
        width: 500px;
    }

    .toast-with-no-close-button [aria-label="Close"] {
      display: none;
    }
`;

export default AppStyle;
