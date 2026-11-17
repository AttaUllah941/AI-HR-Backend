# Logical backup of Zenith HR Postgres (gzip SQL) on Windows.
# Requires pg_dump on PATH (PostgreSQL client tools).
# Usage:
#   .\scripts\backup-db.ps1
#   $env:POSTGRES_PASSWORD='secret'; .\scripts\backup-db.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $Root 'backups' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$OutFile = Join-Path $OutDir "zenith_hr_$Stamp.sql.gz"

$HostName = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { 'localhost' }
$Port = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { '5432' }
$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'zenith' }
$Db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'zenith_hr' }
if (-not $env:PGPASSWORD) {
  $env:PGPASSWORD = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { 'zenith' }
}

Write-Host "Backing up ${User}@${HostName}:${Port}/${Db} → $OutFile"
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  throw 'pg_dump not found on PATH. Install PostgreSQL client tools or use: docker compose --profile backup run --rm db-backup'
}

$tmpSql = Join-Path $OutDir "zenith_hr_$Stamp.sql"
& pg_dump -h $HostName -p $Port -U $User -d $Db --no-owner --format=plain -f $tmpSql

$inputStream = [System.IO.File]::OpenRead($tmpSql)
try {
  $outputStream = [System.IO.File]::Create($OutFile)
  try {
    $gzip = New-Object System.IO.Compression.GZipStream(
      $outputStream,
      [System.IO.Compression.CompressionMode]::Compress
    )
    try {
      $inputStream.CopyTo($gzip)
    } finally {
      $gzip.Dispose()
    }
  } finally {
    $outputStream.Dispose()
  }
} finally {
  $inputStream.Dispose()
}

Remove-Item $tmpSql -Force
Write-Host "Done → $OutFile"
Get-Item $OutFile | Format-Table Name, Length
