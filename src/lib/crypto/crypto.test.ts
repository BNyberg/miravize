import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToBase64Url } from './bytes.ts'
import { CryptoError } from './errors.ts'
import { canonicalFieldAad, decryptField, encryptField } from './formats.ts'
import {
  PASSWORD_KDF_PARAMS,
  createAccountKeys,
  formatRecoveryKey,
  parseRecoveryKey,
  replaceRecoveryWrap,
  rewrapPrivateKeyWithPassword,
  rewrapPrivateKeyWithRecovery,
  samePrivateKey,
  unlockPrivateKeyWithPassword,
  unlockPrivateKeyWithRecovery,
} from './account-keys.ts'
import { generateBoxKeyPair } from './primitives.ts'
import { openPersonalAvatar, packAvatar, sealPersonalAvatar, unpackAvatar } from './avatar.ts'
import { openPersonalDisplayName, sealPersonalDisplayName } from './display-name.ts'
import { createWorkspaceKey, openWorkspaceKey, sameWorkspaceKey, sealWorkspaceKey } from './workspace-keys.ts'

const userId = '66dbee83-53bc-465d-945e-34be1379904f'
const workspaceId = 'aed825c4-6838-4bda-8f27-20a1cb7053f0'
const recordId = '11111111-1111-4111-8111-111111111111'

const field = {
  workspaceId,
  table: 'time_entries',
  recordId,
  field: 'description',
  keyVersion: 1,
}

test('field encryption round-trips text, empty text, and unicode', async () => {
  const key = await createWorkspaceKey()
  for (const value of ['Personal notes', '', 'Café 名前']) {
    const encrypted = await encryptField(value, key, field)
    assert.equal(await decryptField(encrypted, key, field), value)
  }
})

test('the same text encrypts with a new nonce each time', async () => {
  const key = await createWorkspaceKey()
  const first = await encryptField('same', key, field)
  const second = await encryptField('same', key, field)
  assert.notEqual(first.iv, second.iv)
  assert.notEqual(first.ct, second.ct)
})

test('copying ciphertext onto another record, field, or workspace fails', async () => {
  const key = await createWorkspaceKey()
  const encrypted = await encryptField('client name', key, field)
  const cases = [
    { ...field, recordId: '22222222-2222-4222-8222-222222222222' },
    { ...field, field: 'name' },
    { ...field, workspaceId: '8f847e4c-b4f7-4f95-821a-4b8925d0c4b1' },
    { ...field, keyVersion: 2 },
  ]
  for (const aad of cases) {
    await assert.rejects(decryptField(encrypted, key, aad), (error: unknown) => {
      assert.ok(error instanceof CryptoError)
      assert.equal(error.code, 'integrity')
      return true
    })
  }
})

test('a corrupt ciphertext fails closed', async () => {
  const key = await createWorkspaceKey()
  const encrypted = await encryptField('keep me', key, field)
  const broken = { ...encrypted, ct: bytesToBase64Url(new Uint8Array(32)) }
  await assert.rejects(decryptField(broken, key, field), (error: unknown) => {
    assert.ok(error instanceof CryptoError)
    assert.notEqual((error as CryptoError).message, '')
    return true
  })
})

test('canonical additional data has a fixed field order', () => {
  assert.equal(
    canonicalFieldAad(field),
    JSON.stringify({
      v: 1,
      workspace_id: workspaceId,
      table: 'time_entries',
      record_id: recordId,
      field: 'description',
      key_version: 1,
    }),
  )
})

test('two workspaces get independent keys', async () => {
  const first = await createWorkspaceKey()
  const second = await createWorkspaceKey()
  assert.equal(sameWorkspaceKey(first, second), false)
})

test('a sealed workspace key opens only for the intended member', async () => {
  const alice = await generateBoxKeyPair()
  const bob = await generateBoxKeyPair()
  const workspaceKey = await createWorkspaceKey()
  const sealed = await sealWorkspaceKey(workspaceKey, alice.publicKey)
  const opened = await openWorkspaceKey(sealed, alice.publicKey, alice.privateKey)
  assert.equal(sameWorkspaceKey(opened, workspaceKey), true)
  await assert.rejects(openWorkspaceKey(sealed, bob.publicKey, bob.privateKey), (error: unknown) => {
    assert.ok(error instanceof CryptoError)
    assert.equal(error.code, 'integrity')
    return true
  })
  const encrypted = await encryptField('shared name', opened, field)
  assert.equal(await decryptField(encrypted, workspaceKey, field), 'shared name')
})

test('a personal avatar opens only with the same private key', async () => {
  const alice = await generateBoxKeyPair()
  const bob = await generateBoxKeyPair()
  const packed = packAvatar(new Uint8Array([1, 2, 3, 4]), 'image/webp')
  const sealed = await sealPersonalAvatar(userId, packed, alice.privateKey)
  const opened = await openPersonalAvatar(userId, sealed, alice.privateKey)
  assert.equal(opened, packed)
  assert.deepEqual([...unpackAvatar(opened).bytes], [1, 2, 3, 4])
  await assert.rejects(openPersonalAvatar(userId, sealed, bob.privateKey))
})

test('a personal display name opens only with the same private key', async () => {
  const alice = await generateBoxKeyPair()
  const bob = await generateBoxKeyPair()
  const sealed = await sealPersonalDisplayName(userId, 'Niiyama', alice.privateKey)
  assert.equal(await openPersonalDisplayName(userId, sealed, alice.privateKey), 'Niiyama')
  await assert.rejects(openPersonalDisplayName(userId, sealed, bob.privateKey), (error: unknown) => {
    assert.ok(error instanceof CryptoError)
    return true
  })
})

test('password and recovery wrappers open the same private key', { timeout: 120_000 }, async () => {
  const created = await createAccountKeys({ userId, password: 'current-password-1' })
  assert.deepEqual(created.passwordWrapped.params, PASSWORD_KDF_PARAMS)
  const fromPassword = await unlockPrivateKeyWithPassword({
    userId,
    password: 'current-password-1',
    wrapped: created.passwordWrapped,
  })
  const fromRecovery = await unlockPrivateKeyWithRecovery({
    userId,
    recoveryKey: formatRecoveryKey(created.recoveryKey),
    wrapped: created.recoveryWrapped,
  })
  assert.equal(samePrivateKey(fromPassword, created.privateKey), true)
  assert.equal(samePrivateKey(fromRecovery, created.privateKey), true)
  assert.equal(parseRecoveryKey(formatRecoveryKey(created.recoveryKey)), created.recoveryKey)

  await assert.rejects(
    unlockPrivateKeyWithPassword({ userId, password: 'wrong-password-1', wrapped: created.passwordWrapped }),
    (error: unknown) => error instanceof CryptoError && error.code === 'integrity',
  )
  await assert.rejects(
    unlockPrivateKeyWithRecovery({ userId, recoveryKey: 'not-the-recovery-key', wrapped: created.recoveryWrapped }),
    (error: unknown) => error instanceof CryptoError,
  )
  await assert.rejects(
    unlockPrivateKeyWithPassword({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      password: 'current-password-1',
      wrapped: created.passwordWrapped,
    }),
    (error: unknown) => error instanceof CryptoError && error.code === 'integrity',
  )

  const rewrapped = await rewrapPrivateKeyWithPassword({
    userId,
    currentPassword: 'current-password-1',
    nextPassword: 'next-password-2',
    wrapped: created.passwordWrapped,
  })
  const fromNext = await unlockPrivateKeyWithPassword({ userId, password: 'next-password-2', wrapped: rewrapped })
  assert.equal(samePrivateKey(fromNext, created.privateKey), true)
  await assert.rejects(
    unlockPrivateKeyWithPassword({ userId, password: 'current-password-1', wrapped: rewrapped }),
    (error: unknown) => error instanceof CryptoError && error.code === 'integrity',
  )

  const replaced = await replaceRecoveryWrap(userId, created.privateKey)
  const fromReplaced = await unlockPrivateKeyWithRecovery({
    userId,
    recoveryKey: formatRecoveryKey(replaced.recoveryKey),
    wrapped: replaced.wrapped,
  })
  assert.equal(samePrivateKey(fromReplaced, created.privateKey), true)
  assert.notEqual(replaced.wrapped.recovery_key_id, created.recoveryWrapped.recovery_key_id)
  await assert.rejects(
    unlockPrivateKeyWithRecovery({ userId, recoveryKey: created.recoveryKey, wrapped: replaced.wrapped }),
    (error: unknown) => error instanceof CryptoError && error.code === 'integrity',
  )
  const stillPassword = await unlockPrivateKeyWithPassword({
    userId,
    password: 'current-password-1',
    wrapped: created.passwordWrapped,
  })
  assert.equal(samePrivateKey(stillPassword, created.privateKey), true)

  const fromRecoveryReset = await rewrapPrivateKeyWithRecovery({
    userId,
    recoveryKey: created.recoveryKey,
    nextPassword: 'reset-password-3',
    wrapped: created.recoveryWrapped,
  })
  const fromReset = await unlockPrivateKeyWithPassword({
    userId,
    password: 'reset-password-3',
    wrapped: fromRecoveryReset,
  })
  assert.equal(samePrivateKey(fromReset, created.privateKey), true)
  await assert.rejects(
    unlockPrivateKeyWithPassword({ userId, password: 'current-password-1', wrapped: fromRecoveryReset }),
    (error: unknown) => error instanceof CryptoError && error.code === 'integrity',
  )
  const recoveryStillOpens = await unlockPrivateKeyWithRecovery({
    userId,
    recoveryKey: created.recoveryKey,
    wrapped: created.recoveryWrapped,
  })
  assert.equal(samePrivateKey(recoveryStillOpens, created.privateKey), true)
})
