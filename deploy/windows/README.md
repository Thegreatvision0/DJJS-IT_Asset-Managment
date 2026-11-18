# DJJS IT Asset Management: server setup (Windows Server)

This puts the app on an always-on office server, so it no longer depends on anyone's PC. After setup:

- Staff open **https://assets.nrm.org** from office PCs and Wi-Fi.
- Staff sign in with their **NRM Windows username and password**.

Setup takes about 30 minutes.

## 1. What the server needs

| | |
|---|---|
| OS | Windows Server 2019 or newer, **joined to NRM.ORG** |
| Size | 2 vCPU, 4 GB RAM, 40 GB disk (a VM is fine) |
| Network | A **fixed IP address**. It must reach the domain controllers on port 636 (secure LDAP). |
| Ports | **80 and 443 free.** If IIS uses them, stop IIS or move it to another port. |
| Software | **Node.js LTS**, from https://nodejs.org (the Windows Installer .msi).<br>**MongoDB Community Server**, from https://www.mongodb.com/try/download/community. In the installer, tick *Install MongoD as a Service*. MongoDB Compass is optional.<br>**Git**, from https://git-scm.com. Optional: without Git, copy the app folder as a ZIP instead. |

## 2. Get the app onto the server

```powershell
cd C:\
git clone https://github.com/Thegreatvision0/DJJS-IT_Asset-Managment.git DJJS-ITAM
```

If the repository is private, sign in to GitHub with an account the owner has added. Or copy the folder from the owner as a ZIP instead.

## 3. Bring the existing data (optional)

On the **old PC** (the owner's), in the app folder. It must have the latest version of the code, which includes `dbTransfer.js`:

```powershell
cd "I:\MY CODE\Djjs-Asset Management\server"
node src\dbTransfer.js export D:\itam-export.json
```

Copy `itam-export.json` to the server, for example to `C:\itam-export.json`.

The file contains password hashes. Treat it like a backup, and delete the copies once the data is loaded.

## 4. Run the setup script

Open **PowerShell as Administrator** on the server:

```powershell
cd C:\DJJS-ITAM\deploy\windows
Set-ExecutionPolicy -Scope Process Bypass
.\Install-AssetServer.ps1 -DataFile C:\itam-export.json
```

Leave out `-DataFile` to start with an empty database.

The script asks for a password for the built-in **admin** account. Keep this account as the way in if the domain is ever unreachable. Then the script:

- builds the app and writes `server\.env` (readable only by Administrators and SYSTEM);
- requests an HTTPS certificate for `assets.nrm.org` from **NRM-NRMDC-01-CA-1**, using the *WebServer* template;
- opens ports 80 and 443 in Windows Firewall;
- starts the app as a background task at every boot, running as SYSTEM, so nobody needs to log in;
- schedules a **daily backup at 02:00** to `C:\DJJS-ITAM-Backups`, keeping 30 days.

If the CA refuses the certificate request, do one of the following:
- Run the script as a user allowed to enrol the WebServer template.
- Issue a certificate for `assets.nrm.org` yourself, export it as a `.pfx`, and run `.\Install-AssetServer.ps1 -PfxPath C:\assets.pfx`.

## 5. DNS record

On a domain controller, point the name at the server's IP address:

```powershell
Add-DnsServerResourceRecordA -ZoneName 'NRM.ORG' -Name 'assets' -IPv4Address '<server IP>'
```

## 6. First sign-in and approving users

1. Open **https://assets.nrm.org** and sign in as `admin`. If you imported data with `-DataFile`, use the admin password from the old PC. Otherwise use the password chosen during setup.
2. Staff sign in with their Windows username, for example `rahul`, `NRM\rahul` or `rahul@nrm.org`, and their Windows password. The first time, they see "waiting for the IT administrator".
3. As admin, go to **Administration → Users**. Filter **Sign-in With = Active Directory**, open each new user, and choose a **Role**. Their next sign-in works.
4. To remove someone's access, set **Active = No**. Disabling them in AD also blocks sign-in.

Domain users change their password in Windows (Ctrl+Alt+Del). The app never stores Windows passwords.

## Updating to a new version

```powershell
cd C:\DJJS-ITAM\deploy\windows
.\Update-AssetServer.ps1
```

The script backs up the database, gets the latest code, rebuilds, and restarts. The app is offline for about one minute.

## Backup and restore

- **Backups:** daily files are saved as `C:\DJJS-ITAM-Backups\itam-YYYY-MM-DD_HHmm.json`. Copy that folder to another disk or NAS as well.
- **Restore:** first stop the app. In Task Scheduler, right-click **DJJS IT Asset Management** → End. Also end any `node.exe` that is running `C:\DJJS-ITAM\server\src\index.js`. Then:

  ```powershell
  cd C:\DJJS-ITAM\server
  node src\dbTransfer.js import C:\DJJS-ITAM-Backups\itam-<date>.json --force
  ```

  Start the task again. `--force` makes the database exactly match the backup file.

## Troubleshooting

| Problem | Check |
|---|---|
| Site does not open | `C:\DJJS-ITAM\server\data\server.log`. Task Scheduler → *DJJS IT Asset Management* should be **Running**. |
| "port 80 is already used" | Usually IIS (World Wide Web Publishing Service). Stop it, or move it to another port. |
| "Cannot reach the NRM domain controller" | Run `Test-NetConnection NRMDC-01.NRM.ORG -Port 636` from the server. |
| Domain user gets "Invalid username or password" | Wrong password, a locked or disabled AD account, or an app account with the same username already exists. Rename that app account, or set its **Sign-in With** to *Active Directory*. |
