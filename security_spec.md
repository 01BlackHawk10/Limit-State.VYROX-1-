# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Strict PII Isolation**: `/users/{userId}` holds `email` and `displayName` and is strictly readable (`get`) and writable only by `request.auth.uid == userId`. `allow list` on `/users/{userId}` is unconditionally `false`. Public non-PII summaries live separately in `/publicDrivers/{userId}`.
2. **Verified Email Identity Integrity**: Every write operation requires `request.auth != null && request.auth.token.email_verified == true`, and any ownership field (`uid`, `ownerId`, `authorId`) must equal `request.auth.uid` on create and remain immutable on update.
3. **Master Gate Relational Sync**: Subcollections `/users/{userId}/cloudData/{docId}` and `/users/{userId}/draftMaps/{mapId}` verify `exists(/databases/$(database)/documents/users/$(userId))`.
4. **Temporal & Immutable Integrity**: `createdAt` must equal `request.time` on create and remain immutable (`incoming().createdAt == existing().createdAt`) on update. `updatedAt` must equal `request.time` on both create and update.
5. **Zero Shadow Fields & Bounded Arrays**: Every `create` validates exact `keys().hasAll(...)` and `keys().hasOnly(...)`. Every `update` partitions fields into explicit action branches via `incoming().diff(existing()).affectedKeys().hasOnly(...)` wrapped by `isValid[Entity]()`.
6. **Secure List Queries**: `allow list` never delegates filtering solely to the client and never uses `get()`/`exists()` lookups (`draftMaps` enforces `resource.data.authorId == request.auth.uid`; `publicMaps` enforces `resource.data.isPublished == true`; `users`, `cloudData`, and `publicDrivers` disable `list`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated read on `/users/{uid}`**: `request.auth == null`.
2. **Cross-user PII `get` on `/users/{otherUid}`**: Authenticated user reading another driver's private `/users/{otherUid}` email doc.
3. **Blanket `list` scrape on `/users`**: Attempting to list `/users` collection.
4. **Unverified email write**: Authenticated user with `email_verified == false` attempting to create `/users/{uid}`.
5. **Shadow field injection on `/users/{uid}`**: Including `"isAdmin": true` or `"role": "admin"` on create or update.
6. **UID spoofing on `/users/{uid}/cloudData/progress`**: Setting `ownerId` to another user's UID.
7. **ID poisoning / oversized doc ID**: Writing `/users/{uid}/draftMaps/${'x'.repeat(200)}` or invalid characters (`../hack`).
8. **Forged client timestamp**: Creating `CloudProgress` with `createdAt` set to a past timestamp instead of `request.time`.
9. **Immutable `createdAt` or `ownerId` tampering**: Updating `createdAt` or `ownerId` on an existing `CloudProgress` or `CustomMapDoc`.
10. **Negative credits / value poisoning**: Writing `creditsCr: -500` or `selectedCarId` as a 5KB string.
11. **Oversized array DoS on `CustomMapDoc`**: Writing `controlPoints` with > 400 elements or `placedProps` with > 1000 elements.
12. **Publishing unpublished map or hijacking `/publicMaps/{mapId}`**: Writing `isPublished: false` into `/publicMaps` or updating another author's published map.
