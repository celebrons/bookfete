# git-render-deploy-preview.ps1
# Deploiement de la branche de refonte (ex. refonte/sans-ia) vers l'environnement
# de PREVIEW uniquement. Ne touche jamais a la branche main / production.
param(
    [string]$Message
)

# ============================================
# GARDE-FOU : jamais sur main
# ============================================
$currentBranch = (git rev-parse --abbrev-ref HEAD 2>&1).Trim()
if ($currentBranch -eq "main") {
    Write-Host "Vous etes sur la branche 'main'." -ForegroundColor Red
    Write-Host "Ce script est reserve aux branches de refonte (ex. refonte/sans-ia)." -ForegroundColor Red
    Write-Host "Pour deployer main en production, utilisez .\git-render-deploy.ps1" -ForegroundColor Yellow
    exit 1
}

# ============================================
# CHARGER LES VARIABLES D'ENVIRONNEMENT DEPUIS .env
# ============================================
Write-Host "Chargement de la configuration..." -ForegroundColor Gray
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host "Configuration chargee avec succes" -ForegroundColor Green
} else {
    Write-Host "Fichier .env non trouve !" -ForegroundColor Red
    exit 1
}

# ============================================
# CONFIGURATION (depuis les variables d'env)
# ============================================
$GITHUB_TOKEN = $env:GITHUB_TOKEN
$GITHUB_USER = $env:GITHUB_USER
$GITHUB_REPO = $env:GITHUB_REPO
# URLs des deploy hooks Render du service de PREVIEW (distinctes des URLs de prod)
$PREVIEW_BACKEND_URL = $env:PREVIEW_BACKEND_URL
$PREVIEW_FRONTEND_URL = $env:PREVIEW_FRONTEND_URL
# URLs publiques du service de preview, pour la verification finale (facultatif)
$PREVIEW_BACKEND_HEALTH_URL = $env:PREVIEW_BACKEND_HEALTH_URL
$PREVIEW_FRONTEND_PUBLIC_URL = $env:PREVIEW_FRONTEND_PUBLIC_URL

if (-not $GITHUB_TOKEN -or -not $GITHUB_USER -or -not $GITHUB_REPO) {
    Write-Host "Variables GitHub manquantes dans .env" -ForegroundColor Red
    exit 1
}

if (-not $PREVIEW_BACKEND_URL -or -not $PREVIEW_FRONTEND_URL) {
    Write-Host "PREVIEW_BACKEND_URL / PREVIEW_FRONTEND_URL manquants dans .env" -ForegroundColor Yellow
    Write-Host "  -> a remplir une fois les services Render de preview crees." -ForegroundColor Yellow
    Write-Host "  -> le push GitHub fonctionnera quand meme ; seul le declenchement Render sera ignore." -ForegroundColor Yellow
}

# ============================================
# DEBUT DU SCRIPT
# ============================================
Clear-Host
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DEPLOIEMENT PREVIEW - $currentBranch" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $Message) {
    $Message = Read-Host "Message de commit"
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "Preview " + (Get-Date -Format "yyyy-MM-dd HH:mm")
    }
}

Write-Host "Branche : $currentBranch" -ForegroundColor Yellow
Write-Host "Message : $Message" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Commencer le deploiement PREVIEW ? (O/N)"
if ($confirm -ne "O" -and $confirm -ne "o") {
    Write-Host "Annule" -ForegroundColor Red
    exit 0
}

Write-Host ""

# ============================================
# ETAPE 1 : Git avec token
# ============================================
Write-Host "ETAPE 1: Git ($currentBranch)" -ForegroundColor Cyan
Write-Host "----------------"

$remoteUrl = "https://$GITHUB_USER`:$GITHUB_TOKEN@github.com/$GITHUB_USER/$GITHUB_REPO.git"
git remote set-url origin $remoteUrl

Write-Host "  - Ajout des fichiers..." -NoNewline
git add . 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " ERREUR" -ForegroundColor Red
    git remote set-url origin "https://github.com/$GITHUB_USER/$GITHUB_REPO.git"
    exit 1
}

Write-Host "  - Creation du commit..." -NoNewline
$commitOutput = git commit -m "$Message" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host " OK" -ForegroundColor Green
} elseif ($commitOutput -match "nothing to commit") {
    Write-Host " RIEN A COMMITTER" -ForegroundColor Gray
} else {
    Write-Host " ERREUR" -ForegroundColor Red
    Write-Host "    $commitOutput" -ForegroundColor Yellow
}

Write-Host "  - Push vers GitHub ($currentBranch)..." -NoNewline
$pushOutput = git push origin $currentBranch 2>&1
$pushExitCode = $LASTEXITCODE

if ($pushExitCode -eq 0) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " ERREUR" -ForegroundColor Red
    Write-Host "    $pushOutput" -ForegroundColor Yellow

    if ($pushOutput -match "failed to push|rejected") {
        Write-Host ""
        Write-Host "    Le push a ete rejete - tentative de recuperation..." -ForegroundColor Yellow
        Write-Host "    - Pull avec rebase..." -NoNewline
        $pullOutput = git pull origin $currentBranch --rebase 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host " OK" -ForegroundColor Green
            Write-Host "    - Nouveau push..." -NoNewline
            git push origin $currentBranch 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " OK" -ForegroundColor Green
            } else {
                Write-Host " ERREUR" -ForegroundColor Red
                Write-Host "    Echec persistant. Resolution manuelle necessaire." -ForegroundColor Red
                git status
            }
        } else {
            Write-Host " ERREUR" -ForegroundColor Red
            Write-Host "    Echec du pull. Conflits a resoudre manuellement." -ForegroundColor Red
            git status
        }
    }
}

git remote set-url origin "https://github.com/$GITHUB_USER/$GITHUB_REPO.git"
Write-Host ""

# ============================================
# ETAPE 2 : Deploiement PREVIEW backend
# ============================================
if ($PREVIEW_BACKEND_URL) {
    Write-Host "ETAPE 2: Backend preview" -ForegroundColor Cyan
    Write-Host "-------------------"
    Write-Host "  - Deploiement..." -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $PREVIEW_BACKEND_URL -Method POST -UseBasicParsing -TimeoutSec 30
        if ($response.StatusCode -in 200,201,202) {
            Write-Host " OK" -ForegroundColor Green
        } else {
            Write-Host " ERREUR ($($response.StatusCode))" -ForegroundColor Red
        }
    } catch {
        Write-Host " ERREUR ($($_.Exception.Message))" -ForegroundColor Red
    }
    Write-Host ""
} else {
    Write-Host "ETAPE 2: Backend preview ignore (PREVIEW_BACKEND_URL manquant)" -ForegroundColor Gray
}

# ============================================
# ETAPE 3 : Deploiement PREVIEW frontend
# ============================================
if ($PREVIEW_FRONTEND_URL) {
    Write-Host "ETAPE 3: Frontend preview" -ForegroundColor Cyan
    Write-Host "--------------------"
    Write-Host "  - Deploiement..." -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $PREVIEW_FRONTEND_URL -Method POST -UseBasicParsing -TimeoutSec 30
        if ($response.StatusCode -in 200,201,202) {
            Write-Host " OK" -ForegroundColor Green
        } else {
            Write-Host " ERREUR ($($response.StatusCode))" -ForegroundColor Red
        }
    } catch {
        Write-Host " ERREUR ($($_.Exception.Message))" -ForegroundColor Red
    }
} else {
    Write-Host "ETAPE 3: Frontend preview ignore (PREVIEW_FRONTEND_URL manquant)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "DEPLOIEMENT PREVIEW TERMINE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Dashboard: https://dashboard.render.com"
if ($PREVIEW_BACKEND_HEALTH_URL) { Write-Host "Backend preview  : $PREVIEW_BACKEND_HEALTH_URL" }
if ($PREVIEW_FRONTEND_PUBLIC_URL) { Write-Host "Frontend preview : $PREVIEW_FRONTEND_PUBLIC_URL" }
Write-Host ""

if ($PREVIEW_BACKEND_HEALTH_URL -or $PREVIEW_FRONTEND_PUBLIC_URL) {
    Write-Host "Verification des sites..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    if ($PREVIEW_BACKEND_HEALTH_URL) {
        try {
            $backendCheck = Invoke-WebRequest -Uri $PREVIEW_BACKEND_HEALTH_URL -UseBasicParsing -TimeoutSec 10
            Write-Host "  - Backend preview: EN LIGNE ($($backendCheck.StatusCode))" -ForegroundColor Green
        } catch {
            Write-Host "  - Backend preview: EN ATTENTE" -ForegroundColor Yellow
        }
    }

    if ($PREVIEW_FRONTEND_PUBLIC_URL) {
        try {
            $frontendCheck = Invoke-WebRequest -Uri $PREVIEW_FRONTEND_PUBLIC_URL -UseBasicParsing -TimeoutSec 10
            Write-Host "  - Frontend preview: EN LIGNE ($($frontendCheck.StatusCode))" -ForegroundColor Green
        } catch {
            Write-Host "  - Frontend preview: EN ATTENTE" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Appuyez sur une touche pour quitter..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
