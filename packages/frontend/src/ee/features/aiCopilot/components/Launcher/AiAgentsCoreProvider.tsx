import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { store } from '../../store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { PendingPromptProvider } from '../PendingPromptContext/PendingPromptContext';
import { LauncherDockProvider } from './LauncherDockProvider';

// State the agent pages need, without the app-wide launcher and watchers
export const AiAgentsCoreProvider: FC<PropsWithChildren> = ({ children }) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <PendingPromptProvider>
                <LauncherDockProvider>{children}</LauncherDockProvider>
            </PendingPromptProvider>
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);
