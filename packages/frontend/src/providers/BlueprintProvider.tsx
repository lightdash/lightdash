import {
    Colors,
    Dialog,
    FocusStyleManager,
    HotkeysProvider,
} from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/datetime/lib/css/blueprint-datetime.css'; // We need to import the datetime css until this bug is fixed: https://github.com/palantir/blueprint/issues/5388
import '@blueprintjs/datetime2/lib/css/blueprint-datetime2.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

FocusStyleManager.onlyShowFocusOnTabs();

// blueprint overrides
Dialog.defaultProps.canOutsideClickClose = false;
Dialog.defaultProps.canEscapeKeyClose = false;

const GlobalBlueprintStyles = createGlobalStyle`
    body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
           'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans',
            'Helvetica Neue', sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow-x: hidden;
        background: rgb(245, 248, 250);
    }

    code {
        font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
            monospace;
    }

    /* multi select */
    .bp4-multi-select-popover .bp4-menu {
        max-height: 300px;
        max-width: 470px;
        overflow: auto;
    }

    /* Input fields */
    .bp4-input {
        border: 0.7px solid ${Colors.LIGHT_GRAY1};
        box-shadow: inset 0px 1px 1px rgba(16, 22, 26, 0.2);
    }

    .bp4-input::placeholder {
        color: ${Colors.GRAY3};
    }

    .disabled-filter input,
    .disabled-filter > .bp4-input,
    .disabled-filter.bp4-input {
        background: none !important;
        color: ${Colors.DARK_GRAY1} !important;
    }

    .disabled-filter > select,
    .disabled-filter > button {
        background-color: ${Colors.LIGHT_GRAY5} !important;
        color: ${Colors.DARK_GRAY1} !important;
    }
    .disabled-filter > .bp4-icon-caret-down,
    .disabled-filter > .bp4-icon-double-caret-vertical,
    .disabled-filter > .bp4-button-group {
        display: none; /* Remove select arrow */
    }
`;

export const BlueprintProvider: FC = ({ children }) => {
    return (
        <>
            <GlobalBlueprintStyles />
            <HotkeysProvider>
                <>{children}</>
            </HotkeysProvider>
        </>
    );
};
