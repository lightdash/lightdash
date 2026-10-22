import { type ComponentProps, type FC } from 'react';
import DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = ComponentProps<typeof DashboardHeader>;

// Save closes the editor as Done does, Cancel drops what it wrote; both then
// do what they do without it. Each is a no-op while the editor is closed
export const DashboardHeaderGuard: FC<Props> = (props) => {
    const close = useControlsSidebarSelector((c) => c.close);
    const discard = useControlsSidebarSelector((c) => c.discard);
    return (
        <DashboardHeader
            {...props}
            onSaveDashboard={() => {
                close();
                props.onSaveDashboard();
            }}
            onCancel={() => {
                discard();
                props.onCancel();
            }}
        />
    );
};
