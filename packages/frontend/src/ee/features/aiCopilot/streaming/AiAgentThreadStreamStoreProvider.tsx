import { Provider } from 'react-redux';
import { AiAgentThreadStreamAbortControllerContextProvider } from './AiAgentThreadStreamAbortControllerContextProvider';
import { store } from './AiAgentThreadStreamStore';

export const AiAgentThreadStreamStoreProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    return (
        <Provider store={store}>
            <AiAgentThreadStreamAbortControllerContextProvider>
                {children}
            </AiAgentThreadStreamAbortControllerContextProvider>
        </Provider>
    );
};
