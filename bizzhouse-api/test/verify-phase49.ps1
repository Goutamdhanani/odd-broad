$ErrorActionPreference = 'Continue'
$BASE = 'http://localhost:3001/api'
$pass = 0; $fail = 0
function Check($name, $ok) { if ($ok) { $script:pass++; Write-Output "PASS: $name" } else { $script:fail++; Write-Output "FAIL: $name" } }

$login = Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"demo@bizzhouse.com","password":"Demo@BizzHouse2026"}'
$hdr = @{ Authorization = "Bearer $($login.token)" }

# Case A: contact with FRESH inbound (< 24h) -> free text ALLOWED
$freshHook = '{
  "gs_app_id":"mock-app-demo",
  "entry":[{"id":"1","changes":[{"field":"messages","value":{
    "contacts":[{"profile":{"name":"Window Tester A"},"wa_id":"919800000010"}],
    "messages":[{"from":"919800000010","id":"wamid.win_a_' + $([DateTimeOffset]::Now.ToUnixTimeMilliseconds()) + '","text":{"body":"hi, in window"},"timestamp":"' + [Math]::Floor([DateTimeOffset]::Now.ToUnixTimeSeconds()) + '","type":"text"}]
  }}]}]
}'
Invoke-RestMethod -Uri 'http://localhost:3001/webhooks/gupshup' -Method Post -ContentType 'application/json' -Body $freshHook | Out-Null
Start-Sleep -Seconds 3
try {
  $r1 = Invoke-RestMethod -Uri "$BASE/messages/send" -Method Post -Headers $hdr -ContentType 'application/json' -Body '{"contactWaId":"919800000010","type":"text","text":"free-form reply in window"}'
  Check "A: free text ALLOWED inside 24h window (cost=$($r1.costPaise))" ($r1.costPaise -eq 0)
} catch { Check "A: free text ALLOWED inside window -> got: $($_.ErrorDetails.Message)" $false }

# Case B: contact with NO inbound ever -> free text BLOCKED
try {
  Invoke-RestMethod -Uri "$BASE/messages/send" -Method Post -Headers $hdr -ContentType 'application/json' -Body '{"contactWaId":"919800000099","type":"text","text":"should be blocked"}' | Out-Null
  Check 'B: free text BLOCKED outside window' $false
} catch {
  $msg = $_.ErrorDetails.Message
  Check "B: free text BLOCKED outside window (24h msg)" ($msg -like '*24-hour session window*')
}

# Case C: template send still allowed outside window
try {
  $r3 = Invoke-RestMethod -Uri "$BASE/messages/send" -Method Post -Headers $hdr -ContentType 'application/json' -Body '{"contactWaId":"919800000099","type":"template","templateName":"festive_offer_v3","text":"template outside window"}'
  Check "C: template ALLOWED outside window (cost=$($r3.costPaise))" ($r3.costPaise -gt 0)
} catch { Check "C: template ALLOWED outside window -> got: $($_.ErrorDetails.Message)" $false }

Write-Output ''
Write-Output "SESSION WINDOW RESULT: $pass passed, $fail failed"
