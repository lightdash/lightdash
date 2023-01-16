import { Dialog, FocusStyleManager, HotkeysProvider } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/datetime/lib/css/blueprint-datetime.css'; // We need to import the datetime css until this bug is fixed: https://github.com/palantir/blueprint/issues/5388
import '@blueprintjs/datetime2/lib/css/blueprint-datetime2.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import '@blueprintjs/table/lib/css/table.css';
import { FC } from 'react';

FocusStyleManager.onlyShowFocusOnTabs();

// blueprint overrides
Dialog.defaultProps.canOutsideClickClose = false;
Dialog.defaultProps.canEscapeKeyClose = false;

export const BlueprintProvider: FC = ({ children }) => {
    return (
        <HotkeysProvider>
            <>{children}</>
        </HotkeysProvider>
    );
};
