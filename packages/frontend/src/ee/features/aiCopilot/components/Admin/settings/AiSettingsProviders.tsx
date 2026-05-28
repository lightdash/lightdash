import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../../streaming/AiAgentThreadStreamAbortControllerContextProvider';

type Props = {
    children: ReactNode;
};

export const AiSettingsProviders = ({ children }: Props) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            {children}
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);
