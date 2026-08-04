# Backup and Recovery

## Status

Phase 1 persists owner, session, settings, encrypted credential, and audit records but does not provide production backup automation. These rules constrain deployments and later release work.

## Backup set

A complete future backup requires:

1. PostgreSQL data or a verified logical dump.
2. Deployment configuration without plaintext secrets.
3. The AI credential master key stored and backed up separately from PostgreSQL.
4. The application release/version and migration history.

Password hashes and encrypted AI credentials may exist in database backups. Session tokens, rate-limit records, and security events require an explicit retention policy.

## Separation rule

The AI credential master key must never be stored in the same database backup. Loss of the key makes encrypted provider credentials unrecoverable but must not damage operational data. Suspected compromise requires key rotation and provider-credential replacement.

## Restore expectations

Before a production release, a restore runbook must verify:

- a fresh PostgreSQL instance can apply all migrations or restore the backup;
- the restored application version matches the schema;
- access is denied until owner/session integrity is confirmed;
- encrypted credentials either decrypt with the separately restored key or fail closed;
- failed decryption does not block non-AI operational data;
- jobs do not replay consequential actions unexpectedly; and
- rollback and recovery timings are recorded.

## Owner credential recovery

Run the deliberate host-only recovery command:

```bash
pnpm owner:recover
```

The command securely prompts for the existing normalized username and replacement password, atomically changes the credential, increments its version, revokes every session, preserves workspace/operational data, and writes redacted audit metadata. There is no remote recovery endpoint. Back up the database before recovery when operational procedures require it; never place the replacement password in shell history.
