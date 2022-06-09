import { createGlobalStyle } from 'styled-components';

const AppStyle = createGlobalStyle`
    .ace_editor.ace_autocomplete {
        width: 500px;
    }

    .toast-with-no-close-button [aria-label="Close"] {
      display: none;
    }
`;

export default AppStyle;
