# PAMS-OUS — OTP Setup

## 1. Install new dependencies

```powershell
cd "C:\Users\Threndir\Documents\PAMS OUS\pams-ous\backend"
npm install
```

This pulls in `nodemailer` and `dotenv` alongside the existing deps.

## 2. Create `.env`

Copy `.env.example` to `.env` and fill in real values:

```powershell
Copy-Item .env.example .env
notepad .env
```

The important ones:

| Key | Value |
| --- | --- |
| `DB_PASSWORD` | Your MySQL root password |
| `SMTP_USER` | `pupouspams@gmail.com` |
| `SMTP_PASSWORD` | A fresh 16-character Google App Password (see step 4) |
| `SMTP_FROM` | `PUP OUS PAMS <pupouspams@gmail.com>` |

`.env` is gitignored — never commit it.

## 3. Create the OTP table

Run the SQL once against the `people` database:

```powershell
mysql -u root -p people < .\sql\otp_codes.sql
```

(Or paste the contents of `backend/sql/otp_codes.sql` into MySQL Workbench / phpMyAdmin.)

## 4. Generate a fresh Gmail App Password

**The 16-char App Password that was pasted into chat earlier should be considered compromised. Rotate it.**

1. Go to https://myaccount.google.com/apppasswords (requires 2-Step Verification on `pupouspams@gmail.com`).
2. Revoke the previous PAMS entry if it exists.
3. Generate a new App Password labelled e.g. `PAMS OUS Backend`.
4. Copy the 16-character string (no spaces) into `.env` under `SMTP_PASSWORD`.

## 5. Run the backend

```powershell
npx nodemon UserMngmt_APIs/login.js
```

You should see:

```
Server connected at port 3000
```

When a client connects you'll see:

```
Connected!
Search API connected.
Registration API connected.
Management API connected.
OTP API connected.
Password Reset API connected.
```

## 6. Smoke test the three OTP flows

Open the frontend via Live Server at `http://127.0.0.1:5500/frontend/auth/personnel-auth.html`.

### a. Registration (OTP required)

1. Click **Sign Up**, fill the form, click **Create Account**.
2. The backend validates the form, stashes the payload, and emails a 6-digit code to the address you entered.
3. Enter the code in the modal. The account is inserted into `Employees` only after the code verifies.

### b. Sign in (Password OR Email OTP — your pick)

The sign-in form now has a **Password / Email OTP** segmented toggle at the top. Email OTP is an *alternative* to password, not an extra step.

- **Password mode (default):** Enter email + password as before. Single-step sign-in.
- **Email OTP mode:** Switch the toggle to **Email OTP**. The password field disappears. Enter just your email and click **Send Code** → the backend emails a 6-digit code → enter it in the modal → signed in. No password required.

The admin portal has the same toggle (**Security Key / Email OTP**).

### c. Password reset (OTP required)

1. Click **Forgot your password?** → `forgot-password.html`.
2. Enter the account email → receive code → enter code + new password → submit.

## Known limitations / out of scope

- **SMS channel is stubbed.** `backend/UserMngmt_APIs/smsAdapter.js` throws until a
  provider (Semaphore / Twilio / WhatsApp Cloud / Telegram) is wired in. All OTP
  flows currently default to `channel: "email"`.
- The existing `frontend/js/auth.js` still uses `fetch()` against a REST API that
  doesn't exist on the backend (mock mode papers over it). The OTP layer is
  independent — it talks to the backend over Socket.IO — so OTP works regardless
  of mock mode, but the surrounding login/registration mocks remain mocks until
  the two halves are unified.
- `CONFIG.API_BASE_URL` in `frontend/js/config.js` is set to the **frontend**
  Live Server port, not the backend's `:3000`. Left as-is to avoid scope creep.
