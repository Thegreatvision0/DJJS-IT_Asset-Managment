<#
  DJJS IT Asset Management - Windows Server setup (run once, as Administrator, on the office server).

  What it does:
    1. checks Node.js and MongoDB, installs the app's packages and builds the web app
    2. creates server\.env (random secret, admin password you type, MongoDB, NRM Active Directory sign-in)
    3. gets an HTTPS certificate for the site name from the NRM certificate authority (or uses a .pfx you give it)
    4. opens ports 80/443 in Windows Firewall
    5. runs the app as a background task at every start-up (no one needs to be logged in)
    6. schedules a daily database backup (02:00, last 30 days kept)
    7. optionally loads a data file exported from the old PC

  Examples:
    .\Install-AssetServer.ps1
    .\Install-AssetServer.ps1 -HostName assets.nrm.org -DataFile D:\itam-export.json
    .\Install-AssetServer.ps1 -PfxPath D:\assets.pfx          (certificate issued by IT beforehand)
#>
[CmdletBinding()]
param(
  [string]$HostName = 'assets.nrm.org',
  [string]$DataFile = '',
  [string]$PfxPath = '',
  [switch]$SkipCertificate,
  [string]$BackupFolder = 'C:\DJJS-ITAM-Backups',
  [string]$CaConfig = 'NRMDC-01.NRM.ORG\NRM-NRMDC-01-CA-1',
  [string]$AdUrl = 'ldaps://NRMDC-01.NRM.ORG:636,ldaps://NRMDC-02.NRM.ORG:636',
  [string]$AdDomain = 'NRM.ORG'
)
$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "    $m" -ForegroundColor Green }
function Fail($m) { Write-Host "`nSTOPPED: $m" -ForegroundColor Red; exit 1 }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Fail 'Run this script in PowerShell opened with "Run as administrator".' }
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$EnvFile = Join-Path $Root 'server\.env'
$SecretDir = 'C:\ProgramData\DJJS-ITAM'
$TaskName = 'DJJS IT Asset Management'
$ServerJs = Join-Path $Root 'server\src\index.js'
# node processes running THIS app (other node apps on the server are left alone)
function Get-OurNode { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$ServerJs*" } }
if ($DataFile) { if (-not (Test-Path $DataFile)) { Write-Host "STOPPED: data file not found: $DataFile" -ForegroundColor Red; exit 1 }; $DataFile = (Resolve-Path $DataFile).Path }
Write-Host "DJJS IT Asset Management - server setup`nApp folder: $Root" -ForegroundColor Yellow

# ---------------------------------------------------------------- 1. prerequisites
Step 'Checking Node.js and MongoDB'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Node.js is not installed. Install the LTS version from https://nodejs.org (Windows Installer .msi), then run this script again.' }
$nv = [version]((& node -v).TrimStart('v'))
if ($nv -lt [version]'20.12.0') { Fail "Node.js $nv is too old - install the current LTS from https://nodejs.org" }
Ok "Node.js $nv"
$mongo = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
if (-not $mongo) { Fail 'MongoDB is not installed as a service. Install MongoDB Community Server (.msi) from https://www.mongodb.com/try/download/community and tick "Install MongoD as a Service", then run this script again.' }
if ($mongo.Status -ne 'Running') { Start-Service MongoDB; Start-Sleep 3 }
if (-not (Test-NetConnection 127.0.0.1 -Port 27017 -WarningAction SilentlyContinue).TcpTestSucceeded) { Fail 'MongoDB is not answering on port 27017.' }
Ok 'MongoDB service running'
$cs = Get-CimInstance Win32_ComputerSystem
$ours = @(Get-OurNode | ForEach-Object { $_.ProcessId })
$busy = Get-NetTCPConnection -State Listen -LocalPort 80, 443 -ErrorAction SilentlyContinue | Where-Object { $ours -notcontains $_.OwningProcess }
if ($busy) { Fail "Port $($busy[0].LocalPort) is already used by $((Get-Process -Id $busy[0].OwningProcess).ProcessName) (often IIS). Stop that service or move it to another port, then run again." }
Ok 'Ports 80 and 443 are free'
if (-not $cs.PartOfDomain) { Write-Warning 'This server is not joined to a domain - Active Directory sign-in and the NRM certificate need a domain-joined server.' } else { Ok "Domain: $($cs.Domain)" }

# ---------------------------------------------------------------- 2. packages + build
Step 'Installing packages and building the web app (a few minutes)'
Push-Location (Join-Path $Root 'server'); & npm ci --omit=dev --no-audit --no-fund; if ($LASTEXITCODE) { Fail 'npm install (server) failed' }; Pop-Location
Push-Location (Join-Path $Root 'client'); & npm ci --no-audit --no-fund; if ($LASTEXITCODE) { Fail 'npm install (client) failed' }
& npm run build; if ($LASTEXITCODE) { Fail 'web app build failed' }; Pop-Location
Ok 'Built'

# ---------------------------------------------------------------- 3. settings file
# values are written in single quotes, so # and \ are kept literally; ' line breaks and non-ASCII characters are not allowed
function Test-EnvSafe([string]$value) { return ($value -notmatch "['`r`n]") -and ($value -cmatch '^[\x20-\x7E]*$') }
function Set-EnvValue([string]$key, [string]$value) {
  if (-not (Test-EnvSafe $value)) { Fail "The value for $key contains a quote ('), a line break or a non-English character." }
  $lines = @(); if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile) }
  $found = $false
  $lines = @($lines | ForEach-Object { if ($_ -match "^\s*$key=") { $found = $true; "$key='$value'" } else { $_ } })
  if (-not $found) { $lines += "$key='$value'" }
  [IO.File]::WriteAllLines($EnvFile, [string[]]$lines, (New-Object Text.UTF8Encoding $false))
}
function Remove-EnvValue([string]$key) { if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile | Where-Object { $_ -notmatch "^\s*$key=" }); [IO.File]::WriteAllLines($EnvFile, [string[]]$lines, (New-Object Text.UTF8Encoding $false)) } }
function Get-EnvValue([string]$key) { if (Test-Path $EnvFile) { $m = Select-String -Path $EnvFile -Pattern "^\s*$key=(.*)$" | Select-Object -First 1; if ($m) { return $m.Matches[0].Groups[1].Value.Trim().Trim("'").Trim('"') } }; return '' }
function New-Secret([int]$bytes) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return (($b | ForEach-Object { $_.ToString('x2') }) -join '') }

Step 'Writing server settings (server\.env)'
if (-not (Get-EnvValue 'JWT_SECRET')) { Set-EnvValue 'JWT_SECRET' (New-Secret 48) }
if (-not (Get-EnvValue 'ADMIN_PASSWORD')) {
  do {
    $s = Read-Host 'Choose the password for the built-in "admin" account (at least 10 characters)' -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
    if ($p.Length -ge 10 -and -not (Test-EnvSafe $p)) { Write-Host '    Please avoid the quote character ('') and non-English characters.' -ForegroundColor Yellow; $p = '' }
  } while ($p.Length -lt 10)
  Set-EnvValue 'ADMIN_PASSWORD' $p; $p = $null
}
Set-EnvValue 'NODE_ENV' 'production'
Set-EnvValue 'MONGODB_URI' 'mongodb://127.0.0.1:27017/asset_management'
Set-EnvValue 'TOKEN_HOURS' '12'
Set-EnvValue 'TZ' 'Asia/Kolkata'
Set-EnvValue 'AD_URL' $AdUrl
Set-EnvValue 'AD_DOMAIN' $AdDomain
Set-EnvValue 'PORT' '80'
Set-EnvValue 'HTTPS_PORT' '443'
Set-EnvValue 'PUBLIC_HOST' $HostName
Ok 'Settings saved'

# ---------------------------------------------------------------- 4. HTTPS certificate
New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
$pfxOut = Join-Path $SecretDir 'https.pfx'
if ($PfxPath) {
  Step "Using the certificate file $PfxPath"
  if (-not (Test-Path $PfxPath)) { Fail "Certificate file not found: $PfxPath" }
  do {
    $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'Password of that .pfx file' -AsSecureString)))
    $good = $false; try { New-Object Security.Cryptography.X509Certificates.X509Certificate2 ((Resolve-Path $PfxPath).Path), $pw | Out-Null; $good = $true } catch { Write-Host '    Wrong password for that file - try again.' -ForegroundColor Yellow }
    if ($good -and -not (Test-EnvSafe $pw)) { Fail "That .pfx password contains a quote (') or non-English characters. Export the certificate again with a simpler password." }
  } until ($good)
  Copy-Item $PfxPath $pfxOut -Force
  Set-EnvValue 'HTTPS_PFX' $pfxOut
  Set-EnvValue 'HTTPS_PFX_PASS' $pw; $pw = $null
} elseif (-not $SkipCertificate) {
  Step "Requesting an HTTPS certificate for $HostName from the NRM certificate authority"
  $fqdn = "$($env:COMPUTERNAME).$($cs.Domain)".ToLower()
  $tmp = Join-Path $env:TEMP 'itam-cert'; New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  @"
[Version]
Signature="`$Windows NT`$"
[NewRequest]
Subject = "CN=$HostName"
KeyLength = 2048
KeyAlgorithm = RSA
Exportable = TRUE
MachineKeySet = TRUE
HashAlgorithm = sha256
RequestType = PKCS10
KeyUsage = 0xa0
[EnhancedKeyUsageExtension]
OID=1.3.6.1.5.5.7.3.1
[Extensions]
2.5.29.17 = "{text}"
_continue_ = "dns=$HostName&"
_continue_ = "dns=$fqdn&"
_continue_ = "dns=$($env:COMPUTERNAME.ToLower())"
"@ | Set-Content (Join-Path $tmp 'req.inf') -Encoding ASCII
  Remove-Item (Join-Path $tmp '*.req'), (Join-Path $tmp '*.cer'), (Join-Path $tmp '*.rsp') -ErrorAction SilentlyContinue
  & certreq.exe -q -new (Join-Path $tmp 'req.inf') (Join-Path $tmp 'req.req') | Out-Null
  & certreq.exe -q -submit -config $CaConfig -attrib 'CertificateTemplate:WebServer' (Join-Path $tmp 'req.req') (Join-Path $tmp 'cert.cer') | Out-Null
  if (-not (Test-Path (Join-Path $tmp 'cert.cer'))) { Fail "The certificate authority did not issue a certificate (no permission to enrol the 'WebServer' template, or it needs approval). Ask the CA administrator, or run again with -PfxPath <file.pfx> or -SkipCertificate." }
  & certreq.exe -q -accept -machine (Join-Path $tmp 'cert.cer') | Out-Null
  $thumb = (New-Object Security.Cryptography.X509Certificates.X509Certificate2 (Join-Path $tmp 'cert.cer')).Thumbprint
  $cert = Get-Item "Cert:\LocalMachine\My\$thumb"
  $pfxPass = New-Secret 24
  try { Export-PfxCertificate -Cert $cert -FilePath $pfxOut -Password (ConvertTo-SecureString $pfxPass -AsPlainText -Force) | Out-Null }
  catch { Fail "The certificate was issued but its key cannot be exported (template does not allow it). Ask the CA administrator to allow key export on the WebServer template, or give a .pfx with -PfxPath." }
  Set-EnvValue 'HTTPS_PFX' $pfxOut; Set-EnvValue 'HTTPS_PFX_PASS' $pfxPass
  Ok "Certificate issued (valid until $($cert.NotAfter.ToString('dd MMM yyyy')))"
} else {
  Write-Warning 'No HTTPS certificate: the site will run on plain http and Windows passwords would not be encrypted. Add one later by running this script again.'
}
# only administrators and the system account may read the settings and the certificate
& icacls.exe $SecretDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
& icacls.exe $EnvFile /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
# backups contain password hashes: same protection
New-Item -ItemType Directory -Force -Path $BackupFolder | Out-Null
& icacls.exe $BackupFolder /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null

# ---------------------------------------------------------------- 5. firewall
Step 'Opening ports 80 and 443 in Windows Firewall'
if (-not (Get-NetFirewallRule -DisplayName 'DJJS IT Asset Management (HTTP/HTTPS)' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'DJJS IT Asset Management (HTTP/HTTPS)' -Direction Inbound -Protocol TCP -LocalPort 80, 443 -Action Allow -Profile Domain, Private | Out-Null
}
Ok 'Firewall rule in place'

# ---------------------------------------------------------------- 6. data from the old PC
if ($DataFile) {
  Step "Loading data from $DataFile"
  Push-Location (Join-Path $Root 'server'); & node src/dbTransfer.js import $DataFile; $rc = $LASTEXITCODE; Pop-Location
  if ($rc) { Fail 'Data import failed (see the message above). If this server already has data, add --force only if you really want to replace it.' }
}

# ---------------------------------------------------------------- 7. background task + backups
Step 'Running the app as a background task at start-up'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$Root\scripts\office-server.cmd`"" -WorkingDirectory $Root
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings -Force | Out-Null
$bAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$Root\scripts\backup.cmd`" `"$BackupFolder`"" -WorkingDirectory $Root
$bSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "$TaskName - daily backup" -Action $bAction -Trigger (New-ScheduledTaskTrigger -Daily -At 2am) -Principal $principal -Settings $bSettings -Force | Out-Null
Get-OurNode | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-ScheduledTask -TaskName $TaskName
Ok "Task '$TaskName' started; backups go to $BackupFolder every night at 02:00"

# ---------------------------------------------------------------- 8. check
Step 'Checking the app answers'
$https = [bool](Get-EnvValue 'HTTPS_PFX')
$url = if ($https) { 'https://localhost/api/health' } else { 'http://localhost/api/health' }
$up = $false
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
for ($i = 0; $i -lt 30 -and -not $up; $i++) {
  Start-Sleep 2
  try { if ($https) { [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } }; $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5; $up = $r.StatusCode -eq 200 } catch { }
}
if (-not $up) { Fail "The app did not start. See $Root\server\data\server.log" }
Ok 'The app is running'
# the admin account now exists in the database, so its first-run password no longer needs to sit in the settings file
Remove-EnvValue 'ADMIN_PASSWORD'

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
Write-Host @"

Done. Remaining steps for IT:
  1. Give this server a fixed IP address (now $ip) if it does not have one.
  2. On a domain controller, add the DNS record:
       Add-DnsServerResourceRecordA -ZoneName '$AdDomain' -Name '$($HostName.Split('.')[0])' -IPv4Address '$ip'
  3. Open $(if ($https) { 'https' } else { 'http' })://$HostName from any office PC and sign in as admin
     ($(if ($DataFile) { 'with the admin password from the old PC - the data was imported' } else { 'with the password you chose above' })).
  4. Approve domain users under Administration > Users (give each a role).
"@ -ForegroundColor Yellow
