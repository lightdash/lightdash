import { LightdashSDK, LightdashVisualization } from '@lightdash/sdk';
import { useState, version } from 'react';
function App() {
    const [showVisualization, setShowVisualization] = useState(false);

    return (
        <>
            <div>Hello from @lightdash/sdk-test-app - React {version}</div>
            <LightdashSDK />
            <button onClick={() => setShowVisualization(!showVisualization)}>
                Toggle visualization
            </button>
            {showVisualization && <LightdashVisualization />}
        </>
    );
}

export default App;
