[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https?://')]
    [string]$BaseUrl,
    [ValidatePattern('^[A-Za-z0-9._-]{1,64}$')]
    [string]$Username = 'admin',
    [Security.SecureString]$Password
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

function Get-ResponseBody($Response) {
    $body = $Response.Content | ConvertFrom-Json
    if ($null -eq $body) { throw 'The endpoint did not return JSON.' }
    return $body
}

function Get-HttpStatusCode($ErrorRecord) {
    $response = $ErrorRecord.Exception.Response
    if ($null -eq $response) { return $null }
    return [int]$response.StatusCode
}

if ($null -eq $Password) {
    $Password = Read-Host "Enter the verification password for $Username" -AsSecureString
}

$passwordPointer = [IntPtr]::Zero
$plainPassword = $null
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginPayload = @{ username = $Username; password = $plainPassword } | ConvertTo-Json -Compress
    $loginResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post `
        -ContentType 'application/json' -Body $loginPayload -WebSession $session `
        -UseBasicParsing -TimeoutSec 20
    $login = Get-ResponseBody $loginResponse
    if (-not $login.success -or $login.data.username -ne $Username -or $login.data.role -ne 'ADMIN') {
        throw 'The login response did not confirm the administrator identity.'
    }
    $loginCookie = @($loginResponse.Headers['Set-Cookie']) -join ';'
    if ($loginCookie -notmatch '(?i)\btoken=' -or $loginCookie -notmatch '(?i)\bHttpOnly\b') {
        throw 'The login response did not set an HttpOnly token cookie.'
    }

    $meResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/me" -WebSession $session `
        -UseBasicParsing -TimeoutSec 20
    $me = Get-ResponseBody $meResponse
    if (-not $me.success -or $me.data.username -ne $Username -or $me.data.role -ne 'ADMIN') {
        throw '/api/auth/me did not return the current administrator.'
    }

    $logoutResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/logout" -Method Post `
        -WebSession $session -UseBasicParsing -TimeoutSec 20
    $logout = Get-ResponseBody $logoutResponse
    $logoutCookie = @($logoutResponse.Headers['Set-Cookie']) -join ';'
    if (-not $logout.success -or $logoutCookie -notmatch '(?i)\bMax-Age=0\b') {
        throw 'The logout response did not clear the authentication cookie.'
    }

    try {
        Invoke-WebRequest -Uri "$BaseUrl/api/auth/me" -WebSession $session `
            -UseBasicParsing -TimeoutSec 20 | Out-Null
        throw '/api/auth/me remained accessible after logout.'
    }
    catch {
        $status = Get-HttpStatusCode $_
        if ($status -ne 401) { throw }
    }

    try {
        Invoke-WebRequest -Uri "$BaseUrl/api/auth/register" -Method Post `
            -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 20 | Out-Null
        throw 'The public registration endpoint remained available.'
    }
    catch {
        $status = Get-HttpStatusCode $_
        if ($status -ne 404) { throw }
    }

    Write-Output "AUTH_VERIFY_OK base=$BaseUrl user=$Username role=ADMIN registration=closed"
}
finally {
    $plainPassword = $null
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
}
