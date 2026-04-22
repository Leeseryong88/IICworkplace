$path = Get-ChildItem -Path "C:\Users\GENTLE MONSTER\OneDrive" -Directory | Where-Object { $_.Name -match "바탕" } | ForEach-Object { Get-ChildItem -Path $_.FullName -Directory -Filter "코딩" } | ForEach-Object { Get-ChildItem -Path $_.FullName -Directory -Filter "작업장" } | ForEach-Object { Get-ChildItem -Path $_.FullName -Directory -Filter "workspace-dashboard" } | Select-Object -First 1
if ($path) {
    Set-Location $path.FullName
    Write-Host "Moving to: $($path.FullName)"
    
    # Initialize git if not already
    if (!(Test-Path ".git")) {
        git init
    }
    
    # Check if remote exists, if not add it
    $remotes = git remote
    if ($remotes -notcontains "origin") {
        git remote add origin https://github.com/Leeseryong88/IICworkplace.git
    } else {
        git remote set-url origin https://github.com/Leeseryong88/IICworkplace.git
    }
    
    # Configure user if not set (optional but helpful)
    git config user.name "Leeseryong88"
    git config user.email "kidcap1001@naver.com"
    
    # Add and commit
    git add .
    git commit -m "Initial commit"
    
    # Push
    git branch -M main
    git push -u origin main
} else {
    Write-Error "Project path not found."
}

