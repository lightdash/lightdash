import { useEffect, useState } from 'react';
import './App.css';
import { EventMonitor } from './components/EventMonitor';
import { SetupInstructions } from './components/SetupInstructions';
import type { EventLogEntry, LightdashEmbedEvent } from './types';

function App() {
    const [embedUrl, setEmbedUrl] = useState(() => {
        // Load embed URL from localStorage on mount
        return localStorage.getItem('lightdash-iframe-test-embed-url') || '';
    });
    // This is the origin of this particular app. You'll use the origin of your actual app URL
    // that is embedding Lightdash.
    const [targetOrigin, setTargetOrigin] = useState('http://localhost:5173');
    const [iframeSrc, setIframeSrc] = useState('');
    const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
    const [filterEventType, setFilterEventType] = useState('all');
    const [iframeKey, setIframeKey] = useState(0);

    // Save embed URL to localStorage when it changes
    useEffect(() => {
        if (embedUrl) {
            localStorage.setItem('lightdash-iframe-test-embed-url', embedUrl);
        }

        try {
            // Validate the URL
            new URL(embedUrl);

            // Add targetOrigin parameter if not already present
            const url = new URL(embedUrl);
            if (!url.searchParams.has('targetOrigin')) {
                url.searchParams.set('targetOrigin', targetOrigin);
            }

            setIframeSrc(url.toString());
        } catch (error) {
            alert(`Invalid URL format: ${error}`);
        }
    }, [embedUrl]);

    // Handle postMessage events from the iframe
    useEffect(() => {
        const handleMessage = (event: MessageEvent<LightdashEmbedEvent>) => {
            // Verify the origin matches our target origin for security
            // event.origin should be the origin of your embed URL, which is
            // the Lightdash origin where the embed URL was generated.
            const embedOrigin = new URL(embedUrl).origin;
            if (event.origin !== embedOrigin) {
                return;
            }

            // Check if this is a Lightdash event. Will have a util for this in the future.
            if (event?.data?.type?.startsWith('lightdash:')) {
                const logEntry: EventLogEntry = {
                    id: crypto.randomUUID(),
                    timestamp: new Date(),
                    event: event.data,
                };

                setEventLog((prev) => [logEntry, ...prev]);
                console.log('Received Lightdash event:', event.data);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [embedUrl]);

    const refreshIframe = () => {
        setIframeKey((prev) => prev + 1);
    };

    const loadIframe = () => {
        if (!embedUrl.trim()) {
            alert('Please enter an embed URL');
            return;
        }
    };

    const clearEventLog = () => {
        setEventLog([]);
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>Lightdash Iframe Event Test App</h1>
                <p>Test embedded Lightdash dashboards and monitor events</p>
            </header>

            <div className="controls-panel">
                <div className="input-group">
                    <label htmlFor="embed-url">Embed URL:</label>
                    <input
                        id="embed-url"
                        type="text"
                        value={embedUrl}
                        onChange={(e) => setEmbedUrl(e.target.value)}
                        placeholder="http://localhost:3000/embed/dashboard/your-dashboard-uuid"
                        className="url-input"
                    />
                </div>

                <div className="input-group">
                    <label htmlFor="target-origin">Target Origin:</label>
                    <input
                        id="target-origin"
                        type="text"
                        value={targetOrigin}
                        onChange={(e) => setTargetOrigin(e.target.value)}
                        placeholder="http://localhost:5173"
                        className="url-input"
                    />
                </div>

                <button
                    onClick={iframeSrc ? refreshIframe : loadIframe}
                    className="load-button"
                >
                    {iframeSrc ? 'Refresh Iframe' : 'Load Iframe'}
                </button>
            </div>

            <div className="content-container">
                <div className="iframe-panel">
                    <h3>Embedded Dashboard</h3>
                    {iframeSrc ? (
                        <iframe
                            key={iframeKey}
                            src={iframeSrc}
                            className="lightdash-iframe"
                            title="Lightdash Embedded Dashboard"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                    ) : (
                        <div className="iframe-placeholder">
                            <p>
                                Enter an embed URL and click "Load Iframe" to
                                begin
                            </p>
                        </div>
                    )}
                </div>

                <EventMonitor
                    eventLog={eventLog}
                    filterEventType={filterEventType}
                    onFilterChange={setFilterEventType}
                    onClearLog={clearEventLog}
                />
            </div>

            <SetupInstructions />
        </div>
    );
}

export default App;
