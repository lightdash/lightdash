---
name: ld-secret-rotation
description: LIGHTDASH_SECRET rotation requirements. Use when adding an encrypted DB column (EncryptionUtil), a token-hash table (hashWithSecret), or any JWT/HMAC/signed artifact derived from LIGHTDASH_SECRET — each must register with the rotate-lightdash-secret command or rotation strands it.
---

# LIGHTDASH_SECRET-Derived State Must Register for Rotation

Anything persisted or verified using `LIGHTDASH_SECRET` must be covered by the `rotate-lightdash-secret` maintenance command (`packages/backend/src/scripts/rotate-lightdash-secret/`), or secret rotation strands it. When adding:

-   **A new encrypted DB column** (`EncryptionUtil` ciphertext): add it to `CIPHERTEXT_REGISTRY` in `registry.ts` (table, primary key column, column) so the command re-encrypts it.
-   **A new deterministic token-hash table** (`hashWithSecret`): add it to `TOKEN_HASH_TABLES` in `rotation.ts` so hashes are classified and reported as removal blockers. Token hashes are one-way and can never be migrated by the command: lookup verifies against every configured secret, but a credential hashed under a fallback must be reissued or revoked before that fallback is removed.
-   **A new signed or secret-derived artifact** (JWT, HMAC, signed cookie): sign with `lightdashConfig.lightdashSecrets.active`, verify against `lightdashSecrets.all`, and document its lifetime in the removal gates of `docs/lightdash-secret-rotation.md` (short-lived artifacts break once their signing secret leaves the configured secrets; the runbook's waiting periods must cover them).

Tests in `rotation.test.ts` pin the registry contents — update them together with the registry.
