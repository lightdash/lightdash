<summary>
Utility functions and classes for common operations including encryption, slug generation, query building, cron expression manipulation, file downloads, and subtotal calculations. Provides reusable functionality across the backend.
</summary>

<howToUse>
The utils module provides various utility classes and functions. Import specific utilities as needed throughout the backend codebase.

```typescript
import { EncryptionUtil } from './utils/EncryptionUtil/EncryptionUtil';
import { generateUniqueSlug } from './utils/SlugUtils';
import { getAdjustedCronByOffset } from './utils/cronUtils';
import { QueryBuilder } from './utils/QueryBuilder/queryBuilder';

// Encryption/decryption
const encryption = new EncryptionUtil({ lightdashConfig });
const encrypted = encryption.encrypt('sensitive data');
const decrypted = encryption.decrypt(encrypted);

// Generate unique slugs
const slug = await generateUniqueSlug(trx, 'saved_queries', 'My Chart Name');

// Adjust cron expressions for timezone
const adjustedCron = getAdjustedCronByOffset('0 9 * * *', 120); // +2 hours
```

</howToUse>

<codeExample>

```typescript
// Example: Encrypt JWT secret for storage
const encryptionUtil = new EncryptionUtil({ lightdashConfig });
const encryptedSecret = encryptionUtil.encrypt(jwtSecret);
await database('organizations').update({ jwt_secret: encryptedSecret });

// Example: Generate unique chart slug within project scope
const chartSlug = await generateUniqueSlugScopedToProject(
    trx,
    projectUuid,
    'saved_queries',
    'Weekly Sales Report',
);

// Example: Build parameterized query
const queryBuilder = new QueryBuilder(explore, {
    parameters: { date_filter: '2023-01-01' },
    userAttributes: { role: 'manager' },
});
const compiledQuery = queryBuilder.getCompiledQuery();

// Example: Adjust scheduler cron for user timezone
const utcCron = '0 9 * _ 1'; // 9 AM UTC every Monday
const userOffsetMinutes = -300; // EST (-5 hours)
const localizedCron = getAdjustedCronByOffset(utcCron, userOffsetMinutes);
// Result: '0 4 _ \* 1' (4 AM EST)
```

</codeExample>

<importantToKnow>
- EncryptionUtil uses AES-256-GCM with PBKDF2 key derivation for secure encryption
- Slug generation ensures uniqueness within database constraints and handles collisions
- QueryBuilder supports parameter replacement and user attribute filtering
- Cron utility only handles single-value adjustments (not ranges) to avoid complex edge cases
- SlugUtils provides both global and project-scoped uniqueness checking
- SubtotalsCalculator handles pivot table calculations for dashboard tiles
- FileDownloadUtils manages streaming downloads with proper headers and error handling
- All utilities include comprehensive error handling and input validation
- UtilRepository provides dependency injection pattern for utility classes
</importantToKnow>

<links>
@/packages/backend/src/config/lightdashConfig.ts - Configuration for encryption keys
@/packages/common/src/utils/slugs.ts - Common slug generation utilities
@/packages/backend/src/database/entities/ - Database entities used by slug utilities
@/packages/backend/src/utils/QueryBuilder/ - Advanced query building documentation
</links>
