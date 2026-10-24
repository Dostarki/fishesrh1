$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$projectPython = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
$pythonPath = if (Test-Path $projectPython) { $projectPython } else { $pythonCommand.Source }
$runDirectory = Join-Path $projectRoot '.local-run'

function Stop-LocalApi {
    if ($script:apiProcess -and -not $script:apiProcess.HasExited) {
        Stop-Process -Id $script:apiProcess.Id -Force -ErrorAction SilentlyContinue
        $script:apiProcess.WaitForExit()
    }
}

if (-not $pythonCommand) { throw 'Python is required. Install Python 3.10 or newer and retry.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required. Install Node.js and retry.' }

& $pythonPath -c "import eth_account" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Installing the EVM signature verification package.'
    & $pythonPath -m pip install 'eth-account>=0.13.7,<0.14'
    if ($LASTEXITCODE -ne 0) { throw 'Could not install eth-account. Install it with python -m pip install "eth-account>=0.13.7,<0.14" and retry.' }
}

$backendEnvFile = Join-Path $projectRoot 'backend\.env'
$mongoConfigured = -not [string]::IsNullOrWhiteSpace($env:MONGO_URL)
if (Test-Path $backendEnvFile) {
    foreach ($line in Get-Content $backendEnvFile) {
        if ($line -match '^\s*MONGO_URL\s*=\s*(.*?)\s*$') {
            $mongoValue = $Matches[1].Trim().Trim('"').Trim("'")
            if ($mongoValue -and -not $mongoValue.StartsWith('#')) { $mongoConfigured = $true; break }
        }
    }
}
if ($mongoConfigured) {
    & $pythonPath -c "import pymongo" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Installing the MongoDB driver for Early Access points.'
        & $pythonPath -m pip install 'pymongo==4.6.3'
        if ($LASTEXITCODE -ne 0) { throw 'Could not install pymongo. Install it with python -m pip install pymongo==4.6.3 and retry.' }
    }
}

if (-not (Test-Path (Join-Path $projectRoot 'frontend\node_modules'))) {
    $frontendPath = Join-Path $projectRoot 'frontend'
    $frontendReady = $false
    if (Get-Command yarn -ErrorAction SilentlyContinue) {
        try {
            & yarn --cwd $frontendPath install --frozen-lockfile
            $frontendReady = $LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $frontendPath 'node_modules'))
        } catch {
            Write-Host 'Yarn could not install packages; retrying with npm.'
        }
    }
    if (-not $frontendReady) {
        Write-Host 'Installing frontend packages with npm.'
        $savedNpmCache = $env:npm_config_cache
        $savedNpmUserConfig = $env:npm_config_userconfig
        $env:npm_config_cache = Join-Path $frontendPath '.npm-cache'
        $env:npm_config_userconfig = Join-Path $frontendPath '.npmrc'
        try {
            & npm --prefix $frontendPath install --no-package-lock --force
            if ($LASTEXITCODE -ne 0) { throw 'Could not install frontend packages with npm.' }
        } finally {
            $env:npm_config_cache = $savedNpmCache
            $env:npm_config_userconfig = $savedNpmUserConfig
        }
    }
}

New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$stdoutLog = Join-Path $runDirectory 'backend.stdout.log'
$stderrLog = Join-Path $runDirectory 'backend.stderr.log'
$apiReady = $false
$apiHealthReady = $false
try {
    Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 1 | Out-Null
    $apiHealthReady = $true
} catch {
}

if ($apiHealthReady) {
    try {
        $participantsResponse = Invoke-RestMethod 'http://127.0.0.1:8000/api/early-access/participants' -TimeoutSec 1
        if ($null -eq $participantsResponse.PSObject.Properties['participants']) {
            throw 'The response did not include a participants list.'
        }
        $apiReady = $true
        Write-Host 'Using the compatible API already running at http://127.0.0.1:8000.'
    } catch {
        throw 'An older Frostfish API is already using port 8000 and does not provide Early Access. Stop that API, then run .\start.ps1 again. Stopping it clears temporary in-memory game sessions.'
    }
} else {
    $script:apiProcess = Start-Process -FilePath $pythonPath `
        -ArgumentList @('-u', 'backend/local_server.py') `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($script:apiProcess.HasExited) {
            Get-Content $stderrLog -ErrorAction SilentlyContinue | Write-Host
            throw 'The backend stopped during startup. See .local-run\backend.stderr.log.'
        }
        try {
            Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 1 | Out-Null
            $participantsResponse = Invoke-RestMethod 'http://127.0.0.1:8000/api/early-access/participants' -TimeoutSec 1
            if ($null -ne $participantsResponse.PSObject.Properties['participants']) {
                $apiReady = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
}

if (-not $apiReady) {
    Stop-LocalApi
    Get-Content $stderrLog -ErrorAction SilentlyContinue | Write-Host
    throw 'The backend did not become ready. See .local-run\backend.stderr.log.'
}

$savedNodeOptions = $env:NODE_OPTIONS
if ($savedNodeOptions -notmatch '--openssl-legacy-provider') {
    $env:NODE_OPTIONS = "$savedNodeOptions --openssl-legacy-provider".Trim()
}
try {
    Write-Host 'Starting Frostfish at http://localhost:3000. Press Ctrl+C to stop.'
    Set-Location (Join-Path $projectRoot 'frontend')
    & npm start
} finally {
    $env:NODE_OPTIONS = $savedNodeOptions
    Stop-LocalApi
}
