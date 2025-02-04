import LightdashSDK from '@lightdash/sdk';

function App() {
    return (
        <>
            <LightdashSDK.Dashboard
                instanceUrl="http://localhost:3000/"
                getEmbedToken={Promise.resolve(
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJkYXNoYm9hcmQiLCJkYXNoYm9hcmRVdWlkIjoiNWM5NDE2NDEtNDkxMS00ZWY5LWJhZmMtOGU1YjJmOTVhYzg4IiwiZGFzaGJvYXJkRmlsdGVyc0ludGVyYWN0aXZpdHkiOnsiZW5hYmxlZCI6Im5vbmUiLCJhbGxvd2VkRmlsdGVycyI6bnVsbH0sImNhbkV4cG9ydENzdiI6ZmFsc2UsImNhbkV4cG9ydEltYWdlcyI6ZmFsc2V9LCJ1c2VyIjp7ImV4dGVybmFsSWQiOm51bGwsImVtYWlsIjoiZGVtb0BsaWdodGRhc2guY29tIn0sInVzZXJBdHRyaWJ1dGVzIjp7fSwiaWF0IjoxNzM4NjgxNDY3LCJleHAiOjE3Mzg3MTc0Njd9.krvPZqbDRw_olhoq6sSBNYHq5HL_uV0YH-lGJHC-38E',
                )}
                projectUuid="3675b69e-8324-4110-bdca-059031aa8da3"
            />
        </>
    );
}

export default App;
