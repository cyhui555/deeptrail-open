[CmdletBinding()]
param(
    [string]$HostName = $env:DEEPTRAIL_DEPLOY_HOST,
    [string]$SshUser = 'root',
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\deeptrail_release_ed25519",
    [ValidateRange(1, 65535)]
    [int]$SshPort = 22,
    [ValidateRange(0, 30400)]
    [int]$AppPort = 0,
    [string]$ReleaseId,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path

function Resolve-Executable([string[]]$Candidates) {
    foreach ($candidate in $Candidates) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "找不到必需程序：$($Candidates -join ', ')"
}

if ([string]::IsNullOrWhiteSpace($HostName)) {
    throw '必须通过 -HostName 或 DEEPTRAIL_DEPLOY_HOST 显式提供目标主机。'
}
if ($HostName -notmatch '^[A-Za-z0-9.-]+$') { throw 'HostName 包含不允许的字符。' }
if ($SshUser -notmatch '^[A-Za-z0-9._-]+$') { throw 'SshUser 包含不允许的字符。' }
if ($AppPort -ne 0 -and ($AppPort -lt 30301 -or $AppPort -gt 30400)) {
    throw 'AppPort 必须为 0（自动）或 30301-30400。'
}

$Git = Resolve-Executable @('git.exe', 'git')
$Ssh = Resolve-Executable @('C:\Windows\System32\OpenSSH\ssh.exe', 'ssh.exe', 'ssh')
$Scp = Resolve-Executable @('C:\Windows\System32\OpenSSH\scp.exe', 'scp.exe', 'scp')
$IdentityFile = [IO.Path]::GetFullPath($IdentityFile)
if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
    throw "SSH 私钥不存在：$IdentityFile"
}

Push-Location $ProjectRoot
try {
    & $Git diff --quiet
    if ($LASTEXITCODE -ne 0) { throw '存在未提交的 tracked 变更，拒绝冻结 release。' }
    & $Git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) { throw '存在未提交的 staged 变更，拒绝冻结 release。' }

    $Revision = (& $Git rev-parse HEAD).Trim()
    if ($Revision -notmatch '^[0-9a-f]{40,64}$') { throw '无法取得完整 Git revision。' }
    $Version = (Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version
    if (-not $ReleaseId) {
        $UtcStamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
        $ReleaseId = "v$Version-$UtcStamp-$($Revision.Substring(0, 12))"
    }
    if ($ReleaseId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') { throw 'ReleaseId 不合法。' }

    $ArtifactRoot = Join-Path $ProjectRoot "artifacts\releases\$ReleaseId"
    if (Test-Path -LiteralPath $ArtifactRoot) { throw "制品目录已存在，不会覆盖：$ArtifactRoot" }
    New-Item -ItemType Directory -Path $ArtifactRoot | Out-Null
    $Bundle = Join-Path $ArtifactRoot "deeptrail-$ReleaseId.bundle"
    $Checksum = "$Bundle.sha256"
    & $Git bundle create $Bundle HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Git bundle 创建失败。' }
    & $Git bundle verify $Bundle | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Git bundle 校验失败。' }
    $Hash = (Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($Checksum, "$Hash  $([IO.Path]::GetFileName($Bundle))`n", [Text.UTF8Encoding]::new($false))
    Write-Host "已冻结 release：$ReleaseId ($Revision)"
    Write-Host "制品：$Bundle"
    if ($DryRun) { return }

    $Target = "$SshUser@$HostName"
    $RemoteStage = "/tmp/deeptrail-$ReleaseId"
    & $Ssh -i $IdentityFile -p $SshPort -o BatchMode=yes -o StrictHostKeyChecking=yes $Target "umask 077; mkdir -p -- '$RemoteStage'"
    if ($LASTEXITCODE -ne 0) { throw 'SSH 登录失败；请配置受控私钥或 ssh-agent 后重试。' }
    & $Scp -i $IdentityFile -P $SshPort -o BatchMode=yes -o StrictHostKeyChecking=yes $Bundle $Checksum (Join-Path $ScriptDir 'remote-release.sh') "${Target}:$RemoteStage/"
    if ($LASTEXITCODE -ne 0) { throw '发布制品上传失败。' }

    $PortArg = if ($AppPort -eq 0) { 'auto' } else { $AppPort.ToString() }
    $BundleName = [IO.Path]::GetFileName($Bundle)
    $ChecksumName = [IO.Path]::GetFileName($Checksum)
    # Windows OpenSSH 会再次拼接远端命令；避免嵌套双引号，否则非 root 发布入口可能被截断。
    $RemoteCommand = 'if [ $(id -u) -eq 0 ]; then runner=; else runner=sudo; fi; $runner bash ''{0}/remote-release.sh'' --bundle ''{0}/{1}'' --checksum ''{0}/{2}'' --release-id ''{3}'' --revision ''{4}'' --port ''{5}'' --public-host ''{6}''' -f $RemoteStage, $BundleName, $ChecksumName, $ReleaseId, $Revision, $PortArg, $HostName
    $RemoteOutput = & $Ssh -i $IdentityFile -p $SshPort -o BatchMode=yes -o StrictHostKeyChecking=yes $Target $RemoteCommand
    if ($LASTEXITCODE -ne 0) { throw '目标机发布失败；current 仅会在完整验收后切换。' }
    $RemoteOutput | ForEach-Object { Write-Host $_ }
    $PortLine = $RemoteOutput | Where-Object { $_ -match '^DEEPTRAIL_PORT=\d+$' } | Select-Object -Last 1
    if (-not $PortLine) { throw '发布完成但没有取得目标端口。' }
    $PublishedPort = [int]($PortLine -replace '^DEEPTRAIL_PORT=', '')
    $ExternalUrl = "http://${HostName}:$PublishedPort"
    foreach ($Path in @('/login', '/api/health')) {
        $Response = Invoke-WebRequest -Uri "$ExternalUrl$Path" -UseBasicParsing -TimeoutSec 20
        if ($Response.StatusCode -ne 200) { throw "外部验收失败：$Path" }
    }
    Write-Host "外部验收通过：$ExternalUrl"
}
finally {
    Pop-Location
}
