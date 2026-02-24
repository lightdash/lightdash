# EmailClient

## Multi-Recipient Email Privacy

When sending emails to multiple recipients, you must explicitly decide whether to use `to` or `bcc`:

- **`to`**: All recipients can see every other recipient's email address. Use only when recipients should be aware of each other (e.g., a shared thread where visibility is intentional).
- **`bcc`**: Recipients cannot see each other. Use when the recipient list should not be disclosed (e.g., admin notifications, bulk alerts).

Always ask the user/engineer which behavior is intended before choosing. Never default to `to` for multi-recipient emails without confirming that recipient visibility is acceptable.

## Email Image Proxy Behavior

Email services (Gmail, Outlook, Yahoo, etc.) **proxy and cache images** rather than letting the email client fetch them directly. This has critical implications for how we serve images in scheduled email deliveries:

- **How it works**: When an email is delivered, the email service pre-fetches all image URLs through its own proxy (e.g., Gmail uses `googleusercontent.com`). The proxy caches the response and serves it to recipients when they open the email.
- **Why redirects break**: If an image URL returns a 302 redirect to a short-lived signed URL (e.g., S3 pre-signed URLs with 5-min expiry), the proxy caches the redirect target, not our stable URL. By the time a user opens the email, the cached signed URL has expired and the image appears broken.
- **Our solution**: The `/api/v1/file/{id}` endpoint serves image bytes directly (HTTP 200) instead of redirecting, so the proxy caches the actual image content. Non-image files (CSV, XLSX) still use 302 redirects since they're downloaded, not rendered inline.
- **Cache-Control: immutable**: Safe because each scheduler run generates a new nanoid — the content at a given URL never changes.
- **Local testing**: Mailpit (our local email tool) doesn't replicate proxy caching behavior. Real validation requires testing with an actual Gmail/Outlook account.
