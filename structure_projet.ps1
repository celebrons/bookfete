# Script avec dates de modification et export fichier
$excludeFolders = @("node_modules", "bin", "obj", "dist", "build", ".git", ".next", "coverage", "logs", "tmp")
$outputFile = "structure-projet-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').txt"

# En-tête du fichier
@"
=== STRUCTURE COMPLÈTE DU PROJET ===
Généré le : $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')
Dossiers exclus : $($excludeFolders -join ', ')
Chemin racine : $(Get-Location)
"@ | Out-File $outputFile -Encoding UTF8

function Show-Tree {
    param(
        [string]$Path = ".",
        [string]$Indent = "",
        [int]$Level = 0
    )
    
    try {
        $items = Get-ChildItem $Path -ErrorAction SilentlyContinue | 
                 Where-Object { $_.Name -notin $excludeFolders } |
                 Sort-Object { $_.PSIsContainer }, Name
        
        for ($i = 0; $i -lt $items.Count; $i++) {
            $item = $items[$i]
            $isLast = ($i -eq $items.Count - 1)
            $prefix = if ($isLast) { "└── " } else { "├── " }
            
            # Formatage de la date
            $lastWrite = $item.LastWriteTime.ToString("dd/MM/yyyy HH:mm")
            
            if ($item.PSIsContainer) {
                # Pour les dossiers
                $line = "$Indent$prefix📁 $($item.Name)/ [Modif: $lastWrite]"
                Write-Host "$Indent$prefix" -NoNewline
                Write-Host "📁 $($item.Name)/" -ForegroundColor Cyan -NoNewline
                Write-Host " [$lastWrite]" -ForegroundColor Gray
                
                $line | Out-File $outputFile -Append -Encoding UTF8
                
                $newIndent = if ($isLast) { "$Indent    " } else { "$Indent│   " }
                Show-Tree $item.FullName $newIndent ($Level + 1)
            } else {
                # Pour les fichiers avec taille
                $size = if ($item.Length -gt 1MB) {
                    "{0:N1} MB" -f ($item.Length / 1MB)
                } elseif ($item.Length -gt 1KB) {
                    "{0:N1} KB" -f ($item.Length / 1KB)
                } else {
                    "$($item.Length) B"
                }
                
                $line = "$Indent$prefix📄 $($item.Name) [$size] [Modif: $lastWrite]"
                Write-Host "$Indent$prefix" -NoNewline
                Write-Host "📄 $($item.Name)" -ForegroundColor White -NoNewline
                Write-Host " [$size]" -ForegroundColor Yellow -NoNewline
                Write-Host " [$lastWrite]" -ForegroundColor Gray
                
                $line | Out-File $outputFile -Append -Encoding UTF8
            }
        }
    } catch {
        $errorMsg = "$Indent   [Erreur d'accès: $($_.Exception.Message)]"
        Write-Host $errorMsg -ForegroundColor Red
        $errorMsg | Out-File $outputFile -Append -Encoding UTF8
    }
}

# Version avec statistiques détaillées
function Add-Statistics {
    Write-Host "`n📊 Calcul des statistiques..." -ForegroundColor Yellow
    
    $totalFiles = 0
    $totalFolders = 0
    $totalSize = 0
    $fileTypes = @{}
    $oldestFile = $null
    $newestFile = $null
    
    Get-ChildItem -Recurse -ErrorAction SilentlyContinue | 
    Where-Object { 
        $exclude = $false
        foreach ($folder in $excludeFolders) {
            if ($_.FullName -match "\\$folder\\") {
                $exclude = $true
                break
            }
        }
        -not $exclude
    } | ForEach-Object {
        if ($_.PSIsContainer) {
            $totalFolders++
        } else {
            $totalFiles++
            $totalSize += $_.Length
            
            # Compter par extension
            $ext = if ($_.Extension) { $_.Extension.ToLower() } else { "(sans extension)" }
            $fileTypes[$ext] = $fileTypes[$ext] + 1
            
            # Fichier le plus vieux/récent
            if (-not $oldestFile -or $_.LastWriteTime -lt $oldestFile.LastWriteTime) {
                $oldestFile = $_
            }
            if (-not $newestFile -or $_.LastWriteTime -gt $newestFile.LastWriteTime) {
                $newestFile = $_
            }
        }
    }
    
    $stats = @"
`n
=== STATISTIQUES DÉTAILLÉES ===
📊 Total dossiers : $totalFolders
📄 Total fichiers : $totalFiles
💾 Taille totale : {0:N2} MB
📅 Période : du $($oldestFile.LastWriteTime.ToString('dd/MM/yyyy')) au $($newestFile.LastWriteTime.ToString('dd/MM/yyyy'))

📂 Top 10 extensions :
"@ -f ($totalSize / 1MB)
    
    $stats | Out-File $outputFile -Append -Encoding UTF8
    Write-Host $stats -ForegroundColor Green
    
    $fileTypes.GetEnumerator() | 
    Sort-Object Value -Descending | 
    Select-Object -First 10 | 
    ForEach-Object { 
        $line = "   $($_.Key) : $($_.Value) fichiers"
        $line | Out-File $outputFile -Append -Encoding UTF8
        Write-Host $line -ForegroundColor Cyan
    }
    
    # Fichiers récents
    $recentFiles = @"
`n
📝 10 fichiers les plus récents :
"@
    $recentFiles | Out-File $outputFile -Append -Encoding UTF8
    Write-Host $recentFiles -ForegroundColor Green
    
    Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { 
        $exclude = $false
        foreach ($folder in $excludeFolders) {
            if ($_.FullName -match "\\$folder\\") {
                $exclude = $true
                break
            }
        }
        -not $exclude
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 10 |
    ForEach-Object {
        $relativePath = $_.FullName.Replace((Get-Location).Path + "\", "")
        $line = "   📄 $relativePath [$($_.LastWriteTime.ToString('dd/MM/yyyy HH:mm'))]"
        $line | Out-File $outputFile -Append -Encoding UTF8
        Write-Host $line -ForegroundColor White
    }
}

# Exécution principale
Write-Host "`n🔍 Analyse de la structure du projet..." -ForegroundColor Green
Write-Host "📁 Dossiers exclus : $($excludeFolders -join ', ')" -ForegroundColor Yellow
Write-Host "`n"

Show-Tree
Add-Statistics

"`n=== FIN DE LA STRUCTURE ===" | Out-File $outputFile -Append -Encoding UTF8

Write-Host "`n✅ Structure générée avec succès !" -ForegroundColor Green
Write-Host "📁 Fichier créé : $outputFile" -ForegroundColor Cyan
Write-Host "📍 Emplacement : $(Resolve-Path $outputFile)" -ForegroundColor Gray