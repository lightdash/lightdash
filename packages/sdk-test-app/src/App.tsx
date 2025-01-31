import LightdashSDK from '@lightdash/sdk';
import { version } from 'react';

function App() {
    return (
        <>
            <div>Hello from @lightdash/sdk-test-app - React {version}</div>
            <LightdashSDK />
        </>
    );
}

export default App;
