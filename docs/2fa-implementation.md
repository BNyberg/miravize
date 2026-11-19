# Two-factor authentication

Authenticator (TOTP) is optional until a factor is verified. After that, a password session is not enough. The app, the database, and privileged server functions all refuse to treat that session as signed in until the authenticator code has been accepted.

Backup codes are a recovery path, not a way around that check.

## Assurance

There are two session levels.

- **AAL1.** Password or other first factor only. This is the session that exists immediately after sign-in.
- **AAL2.** The same session after a successful authenticator verification.

The auth server reports both the **current** level of the access token and the **next** level the user could reach. Next is AAL2 when a verified authenticator factor exists. Next stays at the current level when no verified factor exists.

Rules that follow from that:

- No verified factor: AAL1 may use the app. Setup is offered, not forced.
- Verified factor and current level is AAL1: the user is on the challenge screen. They do not see the app.
- Verified factor and current level is AAL2: the user may use the app, unless backup codes from an unfinished setup still have to be confirmed.

Do not infer "2FA is on" from a metadata flag alone. The verified factor is the source of truth for whether AAL2 is required. Metadata only records setup progress (device name, skip, re-enroll, backup codes not yet confirmed).

## Do not paint the app early

Resolve the session and the assurance level before rendering either the signed-in shell or the signed-out screens that would flash and then be replaced.

While that check is in flight, render an empty full-viewport background. No navigation, no data providers that load workspace data, no authenticator card.

If the assurance check fails, show that error and a retry. Do not guess a level and let the user in.

Signed-out routes stay signed-out only while there is no session. A session that still needs a challenge, setup, or backup confirmation is redirected to the matching authenticator route. Signed-in routes do the reverse: anything other than "ready" is sent to the challenge or the setup card, and the signed-in data provider is not mounted.

This is what stops the app from appearing for a frame and then being covered by the code form.

## Gate order

Evaluate the session in this order. The order is the security boundary.

1. **Challenge.** Current level is AAL1 and next level is AAL2, and this tab is not in the middle of the backup step that just verified the factor. Go to the authenticator challenge.
2. **Backup confirmation.** This tab is holding the backup step, or the account is marked backup-pending. Go to the backup-code screen.
3. **Setup.** The account is marked re-enroll required, or this tab is holding setup. Go to authenticator enrollment.
4. **Ready.** Otherwise enter the app.

Challenge comes before backup confirmation on purpose. A verified factor already exists by the time backup codes are shown. Signing out and signing back in with only the password must ask for the authenticator again. Checking "backup codes not confirmed" first would skip that and open the backup screen on an AAL1 token. That token cannot save codes, and it must not be allowed to see them without proving possession of the authenticator.

The one exception is an in-memory hold for the tab that just verified the code. That tab stays on the backup screen. A new sign-in has no hold, so it is challenged first. After the challenge raises the session to AAL2, the pending flag still routes to the backup screen.

Do not force setup on every AAL1 session. People who never enrolled, or who skipped, enter the app. Setup runs when they choose it, or when recovery has removed the old factor and set re-enroll required.

## Session updates that drop the level

Verifying a code raises the access token to AAL2. Updating account metadata often replaces that token with a new AAL1 token. The verified factor is still there, so the next request looks like a password session that has not passed the challenge.

Any step that writes metadata after a successful verification must refresh the session before it clears the in-tab hold and before it decides the user may enter the app. Refresh once. Do not start a second refresh from the auth-state listener while that refresh is already in flight. Overlapping refreshes are what leaves the Complete button spinning: the handler is still awaiting a refresh that will not settle, and the loading flag is never cleared.

If the refresh fails, stay on the current card, stop the spinner, and show an error toast. Do not clear the hold first. Clearing it while the token is still AAL1 flips the gate to the challenge underneath the unfinished request.

## Metadata

Store these on the user record. They are hints for routing. They are not a substitute for the factor or the token level.

| Flag | Meaning |
| --- | --- |
| Backup pending | A factor is verified and a code set was stored, but the user has not confirmed they saved it. |
| Re-enroll required | A backup code was redeemed. The old factor is gone. A new authenticator must be enrolled. Skip is not offered. |
| Setup skipped | The user dismissed optional enrollment. Do not send them back to setup on the next visit. |
| Device name | Optional label shown on the security card. Empty means the default label "Authenticator". |

## Shared authenticator UI

Challenge, setup, and backup confirmation use the same narrow auth card: mark, centered title, short subtitle, then the form. Failures are toasts (what failed, then the specific message). They are not inline errors on the card. A failed call to a server function does not put that message on the client error. The client error text is the generic line that the function returned a non-2xx status. The function's own error string is on the response body. Read that body and toast it. Toasting the generic status line hides the real failure, including an invalid backup code and a missing recovery function.

There is always a text **Sign out** control. Sign-out clears the in-tab hold.

### Six-digit code

Six separate boxes, not one hidden input painted over the row.

- Numeric only. Strip everything else.
- The first box is the password-manager field: `autocomplete="one-time-code"`, `name="one-time-code"`, `inputmode="numeric"`. The other boxes are `autocomplete="off"`.
- Paste and password-manager fill land in the first box and spread across the six. A full code may also be typed or pasted into a later box; keep only digits and cap at six.
- Arrow keys move between boxes. Backspace on an empty box clears the previous box and focuses it.
- Focus selects the digit. Each box has its own hover and a visible focus ring so it is obvious which box is active.
- The primary button label counts down from the number of empty boxes (`6`, `5`, … `1`) and becomes the real label (**Continue** or **Log in**) only when all six are filled. The button stays disabled until then, and while the request is in flight.

## Flow: optional setup

Opened from the security card, or whenever the gate is setup and re-enroll is not required.

**Screen.** Title "Set up two-factor authentication". Subtitle tells the user to scan, then enter the 6-digit code. A large QR image (fixed square, bordered). Until the QR exists, show an empty square of the same size so the card does not jump. The enrollment payload is often raw SVG, not an image URL. Putting that SVG string in an image source leaves the empty square even though enrollment succeeded. If the value starts with `<svg`, turn it into an SVG data URL before using it as the image source. A value that is already a data URL can be used as-is. Under the QR, the secret in groups of four, as a button. Activating it copies the secret with spaces removed and toasts "Code copied to clipboard". While the secret is loading, the line reads "Preparing setup code…". Then the six boxes, an optional device-name field (placeholder "Optional"), **Continue**, and a quiet line: "Don't want to set up 2FA? Skip". Sign out sits under that.

**Enrollment.** One in-flight enrollment for the tab. Do not call enroll on every render. Before enrolling, delete unverified TOTP factors so a previous abandoned attempt cannot collide on the friendly name. If a verified factor already exists and this is not a re-enroll, do not enroll again and do not show a QR; leave setup and continue to the return path. If the enrolled factor disappears before it is shown (a second mount, a cleaned-up attempt), drop the cached result and enroll again. Do not cache a "already verified" result. The next visit must list factors again. That cache is why a later re-enroll can sit on an empty QR: the screen thinks setup already finished and navigates away, the re-enroll flag sends the user back, and the QR is never set.

**Continue.** Disabled until six digits are present and a factor id exists. On submit, set the in-tab hold to the backup step *before* verification, so a metadata write cannot bounce this tab to the challenge. Challenge that factor, then verify the code. On a wrong code, clear the hold, clear the boxes, and toast. On success the session is AAL2. Immediately generate ten backup codes and store them. Do this before the metadata update. The metadata update can replace the AAL2 token; the store call rejects anything that is not AAL2 once a verified factor exists. If the store fails, clear the hold, stay on the QR step, and toast. Do not mark backup pending.

Then write backup-pending, clear re-enroll, and save the device name (trimmed, or "Authenticator" when empty). Refresh the session so the client is not left on AAL1. Show step two with the codes just stored. Do not generate a second set on that same visit.

**Skip.** Only on optional setup. Unenroll the unverified factor if one was created. Ignore "factor not found" (it was already removed). Mark setup skipped and clear re-enroll. Clear the hold and the enrollment cache, refresh assurance, and enter the app. A verified factor is never skipped past; re-enroll hides Skip.

## Flow: backup codes during setup

**Screen.** Title "Save your backup codes". Subtitle: store them somewhere safe, each code works once. Ten codes in two centered columns, monospace, on a bordered surface. **Copy** and **Download** side by side, disabled until codes exist. Copy writes only the ten codes, one per line, and toasts "Backup codes copied to clipboard." Download is a text file that includes a short heading and the same warning, then the codes, so a saved file is identifiable. The button label flips to "Copied" briefly after a successful copy.

Under that, the label is: Type "I saved my codes". The field is not a password-manager field. **Complete** stays disabled until the trimmed value matches that phrase, case-insensitive, and codes are on screen. It shows a spinner while finishing.

**Why the phrase.** Seeing the codes is not confirmation. The user has to type that they saved them. Closing the tab is not confirmation either.

**Complete.** Write backup-pending false, re-enroll false, and skipped false. Keep the backup hold until the session refresh returns. Then clear the hold, refresh assurance, and go to the return path. On any failure, toast "Couldn't finish setup" and always clear the spinner in a `finally`, including when the success path navigates away.

**Sign out from this screen.** The factor is already verified and backup-pending stays set. The next sign-in is a normal password sign-in, then the authenticator challenge, and only then this screen again.

**Coming back.** The stored values are hashes. The plaintext cannot be shown again. When this screen opens with no codes in memory, and only after the session is AAL2, generate a new set of ten and replace the previous set. Do not call that replace while the session is still AAL1. If the replace fails, clear the codes so Complete stays disabled, and toast.

Replacing the previous set is intentional. The user left before confirming, so the codes they may have copied are no longer the live set. The set on screen is the one that works.

## Flow: sign-in challenge

Shown whenever a verified factor exists and the current token is AAL1. This includes a normal sign-in and a sign-in that still owes backup confirmation.

**Screen.** Title "Two-factor authentication". Subtitle: enter the code from the authenticator app. Six boxes. The button counts down to **Log in**. Under it, a text button: "Lost access? Use a backup code". Sign out.

**Log in.** List factors. Prefer a verified TOTP factor. Challenge it, verify the six digits. On failure, clear the boxes and toast. On success, refresh assurance and navigate to the return path. If backup is still pending, the gate is not ready, so the signed-in guard sends the user to the backup screen. The challenge page does not need to know that.

## Flow: redeem a backup code

**Screen.** Replaces the challenge card in the same shell. Title "Use a backup code". Subtitle: each code works once, and a new authenticator comes next. One text field, not the six boxes. **Log in** is disabled until the field is non-empty after trim. A text button returns to "Use authenticator code". Sign out stays available.

**Server.** The browser sends the code to a function that uses the service role. The user's token only proves who they are. It must not be allowed to read or compare hashes itself.

1. Require the caller's session.
2. Normalize the code: strip spaces and dashes, uppercase.
3. Find an unused row for that user whose hash matches. Comparison is `crypt(normalized, stored_hash)`, so the salt stays inside the hash. Return no row when nothing matches.
4. Delete every verified authenticator factor for that user with the admin API. If listing or deleting fails, stop and do not consume the code.
5. Set re-enroll required, clear skipped, clear backup-pending.
6. Mark that one row used. A second use of the same code fails.

Do these in that order so a failed factor removal does not burn the code, and so the code is burned only after the account is actually set up to re-enroll.

**Client after success.** Clear the in-memory enrollment cache. Refresh the session and assurance. Open setup. Because re-enroll is set, Skip is hidden, and enrollment must create a new factor even if a verified one is still listed. Remove leftover TOTP factors first, then enroll. Treat "factor not found" on that cleanup as success. The factor is already gone, and toasting it stops the QR step. Use a distinct friendly name on this forced enroll so a factor the admin delete did not remove cannot collide with the name "Authenticator".

The session is still AAL1 here. The browser often cannot unenroll a verified factor until the session is AAL2, so this client cleanup is not the removal that matters. The admin delete in the server function is. If that delete missed a verified factor, the client unenroll fails, enrollment can still collide, and the QR never appears. A distinct friendly name covers the name collision. It does not cover a client that is not allowed to delete the old factor.

If the screen receives "already verified" during re-enroll, do not navigate into the app. Stay on setup until a new QR and secret exist.

Then the user goes through optional-setup's Continue and the backup-code screen again. The new verification produces a new code set. The code they just redeemed is already used.

## Flow: security settings

A card on the account page, on the normal card surface.

**Not enrolled** (no path to AAL2). Short line: add an authenticator app. Primary button **Set up 2FA** opens setup and returns here afterward.

**Enrolled** (current or next level is AAL2). Show the device name. **New backup codes** and **Remove 2FA**.

**New backup codes.** A confirmation dialog, not a new page. Title "Save your backup codes". Explain that these replace the previous codes and that each works once. Same two-column list, Copy, Download, and the same typed phrase. **Complete** is disabled until the phrase matches. **Cancel** closes the dialog. Generate the ten codes when the dialog opens, and store them only when Complete succeeds. This user is already AAL2, which is what the store call requires. On failure, toast and leave the dialog open. Copy behavior matches setup: codes only, with the same success toast.

**Remove 2FA.** A confirmation dialog. Title "Remove two-factor authentication?" in the destructive style. Body: backup codes for this authenticator stop working. Cancel and a destructive **Remove**. On confirm: delete stored backup codes, unenroll every TOTP and phone factor, mark setup skipped, clear re-enroll, clear backup-pending, clear the device name, refresh the session, clear the enrollment cache, and refresh assurance. Toast on failure. Do not remove on the first click.

## Backup code storage

Ten codes. Each is 10 characters from an alphabet that omits ambiguous glyphs (`0`, `O`, `1`, `I`), displayed as `XXXXX-XXXXX`.

The table stores the user id, a bcrypt hash, when it was used, and when it was created. No plaintext. Row-level security is enabled and there is no policy for the signed-in role, so the browser cannot select or update the rows. All access goes through functions.

These functions have to exist in the database the app is calling. A migration file in the repo is not enough. If they were never applied, the client gets "could not find the function in the schema cache" and backup codes cannot be saved. Apply the migration to that database, then confirm the replace function is visible to the API. The schema cache reloads when the migration is applied.

**Replace** (signed-in role). Reject unless the token is AAL2. This is stricter than the general rule on purpose: once a verified factor exists, an AAL1 token must not be able to rotate backup codes. Require exactly ten codes. Normalize each one the same way as redeem. Reject anything shorter than 8 characters after normalization. Delete this user's previous rows, then insert the new hashes. The hash function lives in the crypto extension, so the function's search path must include that schema or the call fails after the function exists.

**Delete** (signed-in role). Same AAL check as the rest of the app, then delete this user's rows. Used when removing 2FA.

**Match** and **consume** (service role only). Match returns the row id or nothing. Consume sets used-at if it is still unused. The browser is not granted these.

## Database and server enforcement

A helper answers whether this request satisfies MFA:

- Service role: yes.
- No user: yes (so anonymous auth routes keep working).
- A verified factor exists: yes only when the token's `aal` claim is `aal2`.
- Otherwise: yes.

Put that check in a restrictive policy on every application table and on stored files, for the signed-in role, for both reads and writes. Restrictive policies combine with the existing membership policies. They do not replace them. A member with a password-only token still cannot read rows after they have enrolled.

Privileged functions that do not go through those policies (creating a workspace, accepting an invite, stopping a timer, allocating numbers) call the same check and raise "Two-factor authentication is required" with insufficient-privilege (`42501`) when it fails.

Server functions that act for the user do the same check with the user's token: if next level is AAL2 and current level is not, respond 403 with that same message. Do not rely on the client gate. A direct API call with the AAL1 token must fail the same way.

## Enrollment pitfalls worth keeping

- Apply the recovery functions to the database the app calls. A local SQL file does not register them.
- Turn a raw SVG enrollment payload into a data URL or the QR square stays empty.
- Toast the server function's response body, not the generic non-2xx client error.
- On re-enroll, ignore "factor not found" while cleaning up. The admin delete is what removes a verified factor; the browser is still AAL1 and often cannot.
- Enroll once per tab, and never remember "verified" across a later visit.
- Delete unverified factors before a normal enroll so the friendly name can be reused.
- On re-enroll, clear that cache, remove leftover factors, and use a new friendly name.
- Store backup codes on the AAL2 token from verification, before any metadata update.
- After every metadata update that follows verification, refresh the session before changing the gate.
- Challenge before backup confirmation, except in the tab that just verified.
- Never show a previous backup code again. Issue a new set at AAL2.
- Copy copies the codes only. The download file may include a short explanation.
- The app shell stays unmounted until the level is known.
