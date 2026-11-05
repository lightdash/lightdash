import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import {
    DashboardStoreContext,
    type DashboardStore,
} from '../features/dashboard/store';

export const DashboardStoreTestProvider: FC<
    PropsWithChildren<{ store: DashboardStore }>
> = ({ store, children }) => (
    <Provider store={store} context={DashboardStoreContext}>
        {children}
    </Provider>
);
