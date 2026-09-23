# EmailClient

## Multi-Recipient Email Privacy

When sending emails to multiple recipients, you must explicitly decide whether to use `to` or `bcc`:

- **`to`**: All recipients can see every other recipient's email address. Use only when recipients should be aware of each other (e.g., a shared thread where visibility is intentional).
- **`bcc`**: Recipients cannot see each other. Use when the recipient list should not be disclosed (e.g., admin notifications, bulk alerts).

Always ask the user/engineer which behavior is intended before choosing. Never default to `to` for multi-recipient emails without confirming that recipient visibility is acceptable.
