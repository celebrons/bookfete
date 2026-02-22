# Script de déploiement avec token GitHub (sans fenêtre de login)

param(
    [string]$Message
)

# ============================================
# CONFIGURATION - À REMPLACER !
# ============================================

# 1. Votre token GitHub
$GITHUB_TOKEN = "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"
$GITHUB_USER = "celebrons"
$GITHUB_REPO = "bookfete"
$BACKEND_URL = "https://api.render.com/deploy/srv-d6aq7ccr85hc73eqpe50?key=1E-kcJG_wFc"
$FRONTEND_URL = "https://api.render.com/deploy/srv-d6aqaei4d50c73c84ve0?key=6nd8ie5ibFs"

# ============================================
# DÉBUT DU SCRIPT
# ============================================

Clear-Host
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    DEPLOIEMENT AUTOMATIQUE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Demander le message si non fourni
if (-not $Message) {
    $Message = Read-Host "Message de commit"
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "Mise à jour " + (Get-Date -Format "yyyy-MM-dd HH:mm")
    }
}

Write-Host "Message: $Message" -ForegroundColor Yellow
Write-Host ""

# Confirmation
$confirm = Read-Host "Commencer le deploiement ? (O/N)"
if ($confirm -ne "O" -and $confirm -ne "o") {
    Write-Host "Annule" -ForegroundColor Red
    exit 0
}

Write-Host ""

# ============================================
# ÉTAPE 1 : Git avec token
# ============================================
Write-Host "ETAPE 1: Git" -ForegroundColor Cyan
Write-Host "----------------"

# Configurer l'URL distante avec le token
$remoteUrl = "https://$GITHUB_USER`:$GITHUB_TOKEN@github.com/$GITHUB_USER/$GITHUB_REPO.git"
git remote set-url origin $remoteUrl

# Ajout des fichiers
Write-Host "  - Ajout des fichiers..." -NoNewline
git add . 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { 
    Write-Host " OK" -ForegroundColor Green 
} else { 
    Write-Host " ERREUR" -ForegroundColor Red
    exit 1
}

# Commit
Write-Host "  - Creation du commit..." -NoNewline
git commit -m "$Message" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { 
    Write-Host " OK" -ForegroundColor Green 
} else { 
    Write-Host " ERREUR" -ForegroundColor Red
    Write-Host "    (rien a commit? on continue)" -ForegroundColor Yellow
}

# Push
Write-Host "  - Push vers GitHub..." -NoNewline
git push origin main 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { 
    Write-Host " OK" -ForegroundColor Green 
} else { 
    Write-Host " ERREUR" -ForegroundColor Red
    Write-Host "    (on continue quand meme)" -ForegroundColor Yellow
}

# Remettre l'URL normale (sans token, pour sécurité)
git remote set-url origin "https://github.com/$GITHUB_USER/$GITHUB_REPO.git"

Write-Host ""

# ============================================
# ÉTAPE 2 : Déploiement Backend
# ============================================
Write-Host "ETAPE 2: Backend" -ForegroundColor Cyan
Write-Host "-------------------"

Write-Host "  - Deploiement..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri $BACKEND_URL -Method POST -UseBasicParsing -TimeoutSec 30
    # ✅ 200 = OK, 202 = Accepté (en cours) - les deux sont bons !
    if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 202) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " ERREUR ($($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host " ERREUR ($($_.Exception.Message))" -ForegroundColor Red
}

Write-Host ""

# ============================================
# ÉTAPE 3 : Déploiement Frontend
# ============================================
Write-Host "ETAPE 3: Frontend" -ForegroundColor Cyan
Write-Host "--------------------"

Write-Host "  - Deploiement..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri $FRONTEND_URL -Method POST -UseBasicParsing -TimeoutSec 30
    # ✅ 200 = OK, 202 = Accepté (en cours) - les deux sont bons !
    if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 202) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " ERREUR ($($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host " ERREUR ($($_.Exception.Message))" -ForegroundColor Red
}

# ============================================
# FIN
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "DEPLOIEMENT TERMINE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Liens utiles :"
Write-Host "  - Dashboard: https://dashboard.render.com"
Write-Host "  - Backend  : https://bookfete.onrender.com"
Write-Host "  - Frontend : https://bookfete-front.onrender.com"
Write-Host ""