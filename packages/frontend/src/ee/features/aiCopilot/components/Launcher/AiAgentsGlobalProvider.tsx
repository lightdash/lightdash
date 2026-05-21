import * as Sentry from '@sentry/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { store } from '../../store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { PendingPromptProvider } from '../PendingPromptContext/PendingPromptContext';
import { AiAgentsLauncher } from './AiAgentsLauncher';
import { LauncherDockProvider } from './LauncherDockProvider';

export const AiAgentsGlobalProvider: FC<PropsWithChildren> = ({ children }) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <PendingPromptProvider>
                <LauncherDockProvider>
                    {children}
                    <Sentry.ErrorBoundary fallback={<></>}>
                        <AiAgentsLauncher />
                    </Sentry.ErrorBoundary>
                </LauncherDockProvider>
            </PendingPromptProvider>
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);
