export const oauthPageStyles = `
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Open Sans', 'Helvetica Neue', sans-serif;
        background-color: #f8fafc;
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1.4;
    }
    .container {
        background: white;
        border-radius: 4px;
        border: 1px solid #e9ecef;
        box-shadow: 0px 1px 2px 0px rgba(10, 13, 18, 0.05);
        padding: 24px;
        max-width: 400px;
        width: 90%;
        text-align: center;
    }
    h1 {
        color: #111418;
        margin: 0 0 16px 0;
        font-size: 20px;
        font-weight: 600;
        text-align: center;
    }
    p {
        color: #6c757d;
        margin: 0 0 12px 0;
        line-height: 1.4;
        font-size: 14px;
    }
    .success h1 {
        color: #10b981;
    }
    .error h1 {
        color: #ef4444;
    }
    .icon {
        width: 32px;
        height: 32px;
        margin: 0 auto 16px auto;
        display: block;
    }
    .success .icon {
        color: #10b981;
    }
    .error .icon {
        color: #ef4444;
    }
    .stack {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
`;
