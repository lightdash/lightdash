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
        -webkit-box-sizing: initial;
                box-sizing: initial;
    }

    *,
    *::before,
    *::after{
        -webkit-box-sizing: initial;
                box-sizing: initial;
    }

    body{
        font-size: initial;
        font-weight: initial;
        letter-spacing: initial;
        line-height: initial;
        text-transform: initial;
        color: initial;
        font-family: initial;
    }

    p{
        margin-bottom: initial;
        margin-top: initial;
    }

    small{
        font-size: initial;
    }

    strong{
        font-weight: initial;
    }

    // ::-moz-selection{
    //     background: initial;
    // }

    // ::selection{
    //     background: initial;
    // }

    a{
        color: initial;
        text-decoration: initial;
    }

    a:hover{
        color: initial;
        cursor: initial;
        text-decoration: initial;
    }

    a code{
        color: initial;
    }

    :focus{
        outline: initial;
        outline-offset: initial;
        -moz-outline-radius: initial;
    }

    form {
        display: initial;
    }

    /*********************/
    /* Fix bugs by reset */
    /*********************/

    .bp4-link{
        color:#215db0;
        text-decoration: none;
    }

    .bp4-link:hover{
        color:#215db0;
        text-decoration: underline;
        cursor: pointer;
    }

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
