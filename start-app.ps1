# Start Backend
Write-Host "Starting Backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\Apps\antigravityquizapp; npm run dev"

# Start TV Display
Write-Host "Starting TV Display..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\Apps\antigravityquizapp\client-tv; npm run dev"

# Start Mobile Client
Write-Host "Starting Mobile Client..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\Apps\antigravityquizapp\client-mobile; npm run dev"

Write-Host "All services starting..."
Write-Host "Backend: http://localhost:3000"
Write-Host "TV Display: http://localhost:5174"
Write-Host "Mobile Client: http://localhost:5173"
