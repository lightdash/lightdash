import LightdashSDK from '@lightdash/sdk';

function App() {
    return (
        <>
            <LightdashSDK
                lightdashBaseUrl="app.lightdash.com"
                embedToken="123"
            />
        </>
    );
}

export default App;
