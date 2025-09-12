import styles from './SetupInstructions.module.css';

export function SetupInstructions() {
    return (
        <div className={styles.documentation}>
            <details>
                <summary>Environment Setup Instructions</summary>
                <div className={styles.envDocs}>
                    <h4>Required Backend Environment Variables:</h4>
                    <pre className={styles.envCode}>{`# Enable iframe embedding
EMBEDDING_ENABLED=true

# Enable event system
EMBED_EVENT_SYSTEM_ENABLED=true

# Enable postMessage events
EMBED_EVENT_SYSTEM_POST_MESSAGE_ENABLED=true

# Optional: Rate limiting (defaults shown)
EMBED_EVENT_RATE_LIMIT_MAX_EVENTS=10
EMBED_EVENT_RATE_LIMIT_WINDOW_MS=1000

# Configure allowed domains for CORS
# Add your iframe host domain to the allowed domains list
LIGHTDASH_IFRAME_EMBEDDING_DOMAINS=<comma separated ex. http://localhost:5173>

# Required for iframe embedding and events
# Also requires domains in LIGHTDASH_IFRAME_EMBEDDING_DOMAINS when setting this true
SECURE_COOKIES=true`}</pre>

                    <h4>Testing Events:</h4>
                    <ul>
                        <li>
                            <strong>Filter Changes:</strong> Apply or modify
                            filters in the embedded dashboard
                        </li>
                        <li>
                            <strong>Tab Changes:</strong> Switch between
                            dashboard tabs (if available)
                        </li>
                        <li>
                            <strong>Tile Loading:</strong> Events when all
                            dashboard tiles finish loading
                        </li>
                        <li>
                            <strong>Errors:</strong> Any errors that occur in
                            the embedded dashboard
                        </li>
                    </ul>

                    <h4>Event Types:</h4>
                    <ul>
                        <li>
                            <code>lightdash:filterChanged</code> - Filter state
                            changes
                        </li>
                        <li>
                            <code>lightdash:tabChanged</code> - Tab navigation
                        </li>
                        <li>
                            <code>lightdash:allTilesLoaded</code> - Dashboard
                            fully loaded
                        </li>
                        <li>
                            <code>lightdash:error</code> - Error events
                        </li>
                    </ul>
                </div>
            </details>
        </div>
    );
}
