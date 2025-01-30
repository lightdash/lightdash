import LightdashSDK from '@lightdash/sdk';
import { version } from 'react';

function App() {
    return (
        <>
            <div>test {version}</div>

            <LightdashSDK />
        </>
    );
}

export default App;
