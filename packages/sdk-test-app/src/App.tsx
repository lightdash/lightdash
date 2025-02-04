import LightdashSDK from '@lightdash/sdk';

function App() {
    return (
        <>
            <LightdashSDK.Dashboard
                instanceUrl="http://localhost:3000/"
                getEmbedToken={Promise.resolve(
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJkYXNoYm9hcmQiLCJkYXNoYm9hcmRVdWlkIjoiYzNkNDQ1MGUtZmE3Ni00MmY5LWEwN2ItNjMzNTFhMjExYmFkIiwiZGFzaGJvYXJkRmlsdGVyc0ludGVyYWN0aXZpdHkiOnsiZW5hYmxlZCI6Im5vbmUifSwiY2FuRXhwb3J0Q3N2IjpmYWxzZSwiY2FuRXhwb3J0SW1hZ2VzIjpmYWxzZSwiY2FuRXhwb3J0UGFnZVBkZiI6ZmFsc2UsImNhbkRhdGVab29tIjpmYWxzZSwidXNlciI6eyJlbWFpbCI6ImRlbW9AbGlnaHRkYXNoLmNvbSJ9LCJ1c2VyQXR0cmlidXRlcyI6eyIiOiIifX0sImlhdCI6MTczODY3NjI3MCwiZXhwIjoxNzQxMjY4MjcwfQ.csQg7WFD1CSRPWeDjy2YuZ-v_ME5-Sfx2c7Y6trWa-Q',
                )}
                projectUuid="3675b69e-8324-4110-bdca-059031aa8da3"
            />
        </>
    );
}

export default App;
