import {
    MantineIcon,
    MantineProvider,
    TestFrontendForSdk,
} from '@lightdash/frontend';
import { IconHome } from '@tabler/icons-react';
import { FC, version } from 'react';

const LightdashSDK: FC = () => {
    return (
        <>
            <div>Hello from @lightdash/sdk - React {version}</div>

            <MantineProvider>
                <TestFrontendForSdk />

                <MantineIcon icon={IconHome} size="xxl" color="red" />
            </MantineProvider>
        </>
    );
};

export default LightdashSDK;
