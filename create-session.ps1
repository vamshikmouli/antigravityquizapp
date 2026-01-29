$body = @"
{
  "hostId": "teacher-1",
  "questionIds": [
    "63aab86c-8b63-43b0-a15f-d3905d55682a",
    "ebc6793c-0674-4cd1-83d9-b0d80d537e02",
    "625e50e0-db77-4f2e-94b3-5862f67b5eac"
  ],
  "settings": {
    "musicEnabled": false,
    "showLiveResults": true,
    "allowLateJoin": false
  }
}
"@

$session = Invoke-RestMethod -Uri "http://localhost:3000/api/sessions" -Method POST -Body $body -ContentType "application/json"
Write-Host "Session Created!" -ForegroundColor Green
Write-Host "Session Code: $($session.code)" -ForegroundColor Cyan
Write-Host "Session ID: $($session.id)" -ForegroundColor Yellow
$session.code
