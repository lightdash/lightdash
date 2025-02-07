import Lightdash from '@lightdash/sdk';

function App() {
    const containerStyle = {
        fontFamily: 'Arial, Helvetica, sans-serif',
        // A subtle gradient background
        background: 'linear-gradient(135deg, #f0f2f5 0%, #e9eff5 100%)',
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '20px',
    };

    // Content box style
    const contentStyle = {
        backgroundColor: '#ffffff',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        maxWidth: '800px',
        width: '100%',
    };

    // Chart container style
    const chartContainerStyle = {
        margin: '20px auto',
        width: '100%',
        maxWidth: '600px',
        height: '400px',
        border: '2px dashed #ccc',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fafafa',
    };

    // Info box style with bluish text and a light blue background
    const infoBoxStyle = {
        backgroundColor: '#e7f3fe', // light blue background
        borderLeft: '4px solid #2196F3', // blue accent border
        padding: '15px',
        margin: '20px auto',
        maxWidth: '600px',
        color: '#0b75c9', // bluish text
        borderRadius: '4px',
    };

    return (
        <div style={containerStyle}>
            <div style={contentStyle}>
                <header>
                    <h1 style={{ color: '#333', margin: '0 0 10px' }}>
                        Lightdash SDK
                    </h1>
                    <h2 style={{ color: '#555', margin: '0 0 20px' }}>
                        Dashboard component
                    </h2>
                </header>

                <main>
                    <p
                        style={{
                            fontSize: '1.1em',
                            lineHeight: '1.6',
                            color: '#666',
                        }}
                    >
                        This is a demo page that includes a Lightdash dashboard
                        component. The data is fetched from the Lightdash
                        server, but this app is running locally.
                    </p>

                    <div id="chart-container" style={chartContainerStyle}>
                        <Lightdash.Dashboard
                            instanceUrl="http://localhost:3000/"
                            token={
                                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZW50Ijp7InR5cGUiOiJkYXNoYm9hcmQiLCJkYXNoYm9hcmRVdWlkIjoiNWM5NDE2NDEtNDkxMS00ZWY5LWJhZmMtOGU1YjJmOTVhYzg4IiwiZGFzaGJvYXJkRmlsdGVyc0ludGVyYWN0aXZpdHkiOnsiZW5hYmxlZCI6Im5vbmUifSwiY2FuRXhwb3J0Q3N2IjpmYWxzZSwiY2FuRXhwb3J0SW1hZ2VzIjpmYWxzZSwiY2FuRXhwb3J0UGFnZVBkZiI6ZmFsc2UsImNhbkRhdGVab29tIjpmYWxzZX0sInVzZXIiOnsiZW1haWwiOiJkZW1vQGxpZ2h0ZGFzaC5jb20ifSwidXNlckF0dHJpYnV0ZXMiOnsiIjoiIn0sImlhdCI6MTczODkxNzUwNiwiZXhwIjoxNzM5Mjc3NTA2fQ.ZsDhvqEjlo4j_ELQKfU1zTQw1bmZYqIZCXxQGmPg_-4'
                            }
                            projectUuid="3675b69e-8324-4110-bdca-059031aa8da3"
                        />
                    </div>

                    {/* Info box with bluish text */}
                    <div style={infoBoxStyle}>
                        <p>
                            Additional Information: This chart is powered by
                            Lightdash SDK.
                        </p>
                    </div>
                </main>

                <footer>
                    <p
                        style={{
                            fontSize: '0.9em',
                            color: '#999',
                            margin: '20px 0 0',
                        }}
                    >
                        &copy; 2025 Lightdash
                    </p>
                </footer>
            </div>
        </div>
    );
}

export default App;
