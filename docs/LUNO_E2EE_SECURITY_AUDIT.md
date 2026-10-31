# LUNO E2EE & Security Audit Report

## 1. Cryptographic Controls
- **Client-Side E2EE (`LUNO Sealing`)**: ECDH P-256 key pair generation and AES-GCM-256 shared secret derivation via WebCrypto API (`apps/user-web/src/messenger-utils.ts`), with device public key bundle registration (`PUT /api/v1/devices/:id/keys`).
- **At-Rest Server Encryption**: Go backend encrypts message bodies at rest using AES-GCM (`backend/internal/server/encryption.go`).
- **Session & Access Security**:
  - Argon2id password hashing (`backend/internal/auth/password.go`).
  - Refresh token rotation with reuse detection and session revocation (`backend/internal/server/identity.go`).
  - Strict conversation membership boundary checks verified by `private chat access and one-use realtime tickets` test.
