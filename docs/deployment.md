# Century Sip — Server Deployment Guide (cPanel / LiteSpeed)

This guide covers production deployment for both the **Django Backend** and the **Next.js Web Admin**.

> **CRITICAL SERVER ENVIRONMENT NOTE**  
> The production server has **NO SSH** and **NO cPanel Terminal access**.  
> Never attempt to run shell commands (`git pull`, `source venv/bin/activate`, `pip install`, `python manage.py`) directly on the server.  
> All server operations are executed strictly through:
> 1. **cPanel File Manager** (upload & extract archives, edit `.env`)
> 2. **cPanel &rarr; Setup Python App** ("Execute python script" and "Restart")
> 3. **phpMyAdmin** (database backups and inspection)

---

## 🌐 Production Architecture

| Component | Target URL | Server Path | Type / Entry Point |
| :--- | :--- | :--- | :--- |
| **Backend API** | `https://century.zipnixtechnologies.com/api/` | `/home3/zipnixte/public_html/centuryy/ecom-app/` | Django (Passenger WSGI &rarr; `passenger_wsgi.py`) |
| **Django Admin**| `https://century.zipnixtechnologies.com/admin/` | `/home3/zipnixte/public_html/centuryy/ecom-app/` | Django Admin |
| **Web Admin Panel** | `https://admin.zipnixtechnologies.com` | Document root for `admin.zipnixtechnologies.com` | Next.js Static Export (`out/` + `.htaccess`) |
| **Mobile App** | Android Client | Built via Expo Application Services (EAS) | Standalone APK (`preview` profile) |

---

## ⚠️ Known Server Gotchas & Diagnostics

### 1. LiteSpeed 404 vs Django API (Passenger Startup File)
- **Problem**: Requests to `https://century.zipnixtechnologies.com/api/` return LiteSpeed's generic 404 error rather than Django's response.
- **Cause**: Passenger requires a startup file (`passenger_wsgi.py` or `wsgi.py`) inside the configured Application Root. Without it, the Python app never starts, and LiteSpeed serves the folder as plain static files.
- **Where Passenger Looks**:
  - If cPanel's **Application root** is `public_html/centuryy`: Passenger looks for `passenger_wsgi.py` directly in `/home3/zipnixte/public_html/centuryy/passenger_wsgi.py`. (Use `dist/passenger_wsgi_FOR_centuryy.py` for this).
  - If cPanel's **Application root** is `public_html/centuryy/ecom-app`: Passenger looks inside `ecom-app/passenger_wsgi.py`.
- **Dual Entry Points Provided in Backend**:
  - `passenger_wsgi.py`: prepends `APP_ROOT` to `sys.path`, loads `core.settings`, and exposes `application = get_wsgi_application()`.
  - `wsgi.py`: forwards directly to `core.wsgi` so Passenger boots cleanly even if cPanel's startup filename is configured as `wsgi.py`.
- **cPanel Setup Python App Configuration**:
  - **Application root**: `public_html/centuryy/ecom-app` (or `public_html/centuryy`)
  - **Application startup file**: `passenger_wsgi.py` (or `wsgi.py`)
  - **Application Entry point**: `application`
- **WSGI Verification Script (`tools/try_wsgi.py`)**:
  To test importing the WSGI application exactly as Passenger does and run a test GET request through Django without needing browser access:
  ```
  /home3/zipnixte/public_html/centuryy/ecom-app/tools/try_wsgi.py
  ```
  *(Captures any import error, verifies database connectivity and ALLOWED_HOSTS, and prints the exact traceback if anything fails).*
- **Diagnostic Tool (`tools/passenger_probe.py`)**:
  In Setup Python App &rarr; "Execute python script", run:
  ```
  /home3/zipnixte/public_html/centuryy/ecom-app/tools/passenger_probe.py
  ```
  *(Checks all `passenger_wsgi.py` instances, `.htaccess` Passenger directives, and Python wrappers without printing secrets).*

### 2. Stray Backend in Web Admin Document Root
- If a previous deploy extracted the backend zip into the web admin document root (`admin.zipnixtechnologies.com`), sensitive files like `manage.py` or `core/settings.py` may be exposed over HTTP.
- To safely clean without breaking web pages (`orders`, `plant`, `products`, and `support` exist in BOTH web and backend):
  1. Upload `dist/1_PREVIEW_backend.py` into the admin site root.
  2. Run it via **Setup Python App &rarr; Execute python script** to review files targeted for deletion.
  3. Upload and execute `dist/2_DELETE_backend.py` to remove the backend files by manifest.

---

## ⚙️ Step 1: Pre-Deployment Database Backup (Mandatory)

Always take a database backup in phpMyAdmin before running migrations:

1. Log into **cPanel** &rarr; open **phpMyAdmin**.
2. Select your production database (`zipnixte_century`).
3. Click the **Export** tab &rarr; choose **Quick** &rarr; Format: **SQL** &rarr; click **Export**.
4. Save the `.sql` backup file locally before proceeding.

---

## 🚀 Step 2: Backend Deployment

### A. Packaging the Backend
The deployment zip must **strictly exclude** `.env`, `venv/`, `__pycache__/`, `.pyc`, and `media/`, while ensuring `passenger_wsgi.py`, `wsgi.py`, and `tools/` are included.

To generate or refresh `dist/backend-deploy.zip`:
```powershell
# From repository root
python -c "
import os, zipfile
b = r'backend'; out = r'dist\backend-deploy.zip'
ex_d = {'venv', '__pycache__', 'media', '.git'}
ex_e = {'.pyc', '.pyo'}
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(b):
        dirs[:] = [d for d in dirs if d not in ex_d]
        for f in files:
            if f == '.env' or os.path.splitext(f)[1] in ex_e: continue
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, b))
print('dist/backend-deploy.zip packaged successfully.')
"
```
*(Always verify that `backend-deploy.zip` does not contain `.env` so production database credentials and `SECRET_KEY` are never overwritten).*

### B. Upload & Extract Code
1. Open **cPanel &rarr; File Manager**.
2. Navigate to the backend application root:
   ```
   /home3/zipnixte/public_html/centuryy/ecom-app/
   ```
   *(If `ecom-app` does not exist yet, create it and ensure Setup Python App matches).*
3. Upload `dist/backend-deploy.zip`.
4. Right-click `backend-deploy.zip` &rarr; click **Extract** (into `/home3/zipnixte/public_html/centuryy/ecom-app/`).
5. Ensure `passenger_wsgi.py` is present in the application root.
6. Delete `backend-deploy.zip` from File Manager.

### C. Run Migrations & Collect Static Files
Use the automated cPanel runner scripts provided in `tools/`:

0. **Check first (changes nothing)**:
   In **Setup Python App** &rarr; **Execute python script**, enter:
   ```
   /home3/zipnixte/public_html/centuryy/ecom-app/tools/cpanel_deploy.py
   ```
   The output lists the pending migrations and shows `auto_charge_enabled`. If it says `False`, turn it on in Django admin &rarr; Ledger settings before anyone confirms an online payment.

1. **Run Migrations**:
   In **Setup Python App** &rarr; **Execute python script**, enter:
   ```
   /home3/zipnixte/public_html/centuryy/ecom-app/tools/run_migrations.py
   ```
   *(Or `/home3/zipnixte/public_html/centuryy/ecom-app/tools/cpanel_deploy.py apply`)*
   This applies pending migrations:
   - `accounts.0020_normalize_phone_numbers`
   - `accounts.0021_backfill_address_book`
   - `activities.0002_activity_categories`
   - `ledger.0006_payment_accounts`
   - `ledger.0007_carry_over_existing_payment_account`
   - `ledger.0008_seed_meezan_account`
   - `ledger.0009_paymentclaim`
   - `localization.0004_urdu_master_switch`

2. **Collect Static Files**:
   Run:
   ```
   /home3/zipnixte/public_html/centuryy/ecom-app/manage.py collectstatic --noinput
   ```

3. **Check old online payments (once, after `ledger.0009_paymentclaim`)**:
   Rider Online taps used to credit the customer with nobody checking the bank. This read-only report lists them so they can be compared with the bank statement:
   ```
   /home3/zipnixte/public_html/centuryy/ecom-app/manage.py ledger_unverified_online
   ```
   *(Add `--since 2026-08-01` to shorten the list.)*

### D. Restart the Python App
1. In **Setup Python App**, click the **Restart** button.
2. Verify API status by visiting:
   - `https://century.zipnixtechnologies.com/api/`
   - `https://century.zipnixtechnologies.com/admin/`

---

## 💻 Step 3: Web Admin Frontend Deployment

The web panel is built using Next.js static export (`output: "export"`).

### A. Packaging (Local Build)
1. Verify API toggle in `web/src/lib/constants.ts`:
   ```ts
   const USE_LOCAL = false;
   ```
2. Run build and export verification gate:
   ```powershell
   cd f:\samad\ecom-app\web
   npm run build
   ```
   *(This triggers `node scripts/verify-export.mjs`, ensuring no localhost URLs exist and `.htaccess` + `404.html` are intact).*
3. Package the static distribution:
   ```powershell
   Compress-Archive -Path web\out\* -DestinationPath f:\samad\ecom-app\dist\web-admin.zip -Force
   ```

### B. Upload & Extract to cPanel
1. Open **cPanel &rarr; File Manager**.
2. **IMPORTANT**: Click **Settings** (top right) &rarr; enable **"Show Hidden Files (dotfiles)"** &rarr; click **Save**.
3. Navigate to the document root of `admin.zipnixtechnologies.com`.
4. Upload `dist/web-admin.zip` and extract directly into the document root.
5. Verify that `.htaccess` is present in the document root alongside `index.html`.
6. Test by loading `https://admin.zipnixtechnologies.com` and refreshing a subpage (e.g. `/manage/products/`).

---

## 📱 Step 4: Mobile App Build (EAS)

Run EAS build locally from PowerShell:
```powershell
cd f:\samad\ecom-app\mobile-app
npx eas-cli build --platform android --profile preview
```

- Profile `preview` builds an installable `.apk` file for Android devices.
- Production `API_URL` and Google OAuth client IDs are baked in via `mobile-app/eas.json`.
- `config.ts` enforces `const USE_LOCAL = __DEV__ && true;`, guaranteeing release builds point to the live server.

