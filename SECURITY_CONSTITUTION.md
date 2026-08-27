# ENTERPRISE SECURITY CONSTITUTION & ARCHITECTURAL DIRECTIVES

## 1. Zero-Trust Identity & Access Management
- All operations must be scoped strictly to the authenticated identity (`auth.uid`).
- No direct database writes or reads without Firebase ID Token cryptographic verification.
- Enforce strict tenancy isolation: all collections must strictly follow the `users/{userId}/...` path.

## 2. Secrets & Credential Isolation
- NEVER hardcode secrets, API keys, service account JSONs, or private credentials into source code or Git.
- Inject secrets exclusively via environment variables or Cloud Secret Manager at runtime.

## 3. Threat Modeling & Input Sanitization
- Treat all incoming user inputs as untrusted data: validate schema, string length, and payload boundaries.
- Sanitize prompt inputs to prevent prompt-injection attacks against Gemini.

## 4. Secure Data Persistence (Firestore Rules)
- Deny all public read/write access by default.
- Allow read/write operations only if `request.auth != null && request.auth.uid == userId`.