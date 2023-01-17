import { Dialog, FocusStyleManager, HotkeysProvider } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/datetime/lib/css/blueprint-datetime.css'; // We need to import the datetime css until this bug is fixed: https://github.com/palantir/blueprint/issues/5388
import '@blueprintjs/datetime2/lib/css/blueprint-datetime2.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import '@blueprintjs/table/lib/css/table.css';
import { FC } from 'react';
import { createGlobalStyle } from 'styled-components';

FocusStyleManager.onlyShowFocusOnTabs();

// blueprint overrides
Dialog.defaultProps.canOutsideClickClose = false;
Dialog.defaultProps.canEscapeKeyClose = false;

const ResetBlueprintDump = createGlobalStyle`
    /***********************/
    /* Reset Blueprint CSS */
    /***********************/

    html{
        -webkit-box-sizing: unset;
                box-sizing: unset;
    }

    *,
    *::before,
    *::after{
        -webkit-box-sizing: unset;
                box-sizing: unset;
    }

    body{
        font-size: unset;
        font-weight: unset;
        letter-spacing: unset;
        line-height: unset;
        text-transform: unset;
        color: unset;
        font-family: unset;
    }

    p{
        margin-bottom: unset;
        margin-top: unset;
    }

    small{
        font-size: unset;
    }

    strong{
        font-weight: unset;
    }


    ::-moz-selection{
        background: unset;
    }

    ::selection{
        background: unset;
    }

    a{
        color: unset;
        text-decoration: unset;
    }

    a:hover{
        color: unset;
        cursor: unset;
        text-decoration: unset;
    }

    a code{
        color: unset;
    }

    :focus{
        outline: unset;
        outline-offset: unset;
        -moz-outline-radius: unset;
    }

    form {
        display: unset;
    }

    /*********************/
    /* Fix bugs by reset */
    /*********************/

    a.bp4-breadcrumb:hover {
        cursor: pointer;
    }

    a.bp4-button {
        text-decoration: none;

        &:hover {
            text-decoration: underline;
            cursor: pointer;
        }
    }
`;

export const BlueprintProvider: FC = ({ children }) => {
    return (
        <HotkeysProvider>
            <>
                <ResetBlueprintDump />
                {children}
            </>
        </HotkeysProvider>
    );
};
