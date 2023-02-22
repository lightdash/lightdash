// WARNING: We need to import the datetime css until this bug is fixed: https://github.com/palantir/blueprint/issues/5388
import '@blueprintjs/datetime/lib/css/blueprint-datetime.css';
import '@blueprintjs/datetime2/lib/css/blueprint-datetime2.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
// WARNING: exposes global overrides. DO NOT IMPORT THIS FILE.
// import '@blueprintjs/core/lib/css/blueprint.css';
// below is a cleaner version of the above
import './../styles/blueprint-core.css';

import {
    Colors,
    Dialog,
    FocusStyleManager,
    HotkeysProvider,
} from '@blueprintjs/core';
import { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

FocusStyleManager.onlyShowFocusOnTabs();

// blueprint overrides
Dialog.defaultProps.canOutsideClickClose = false;
Dialog.defaultProps.canEscapeKeyClose = false;

const GlobalBlueprintStyles = createGlobalStyle`
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
