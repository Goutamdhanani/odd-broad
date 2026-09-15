$ErrorActionPreference = 'Continue'
$BASE = 'http://localhost:3001/api'
$pass = 0; $fail = 0

function Check($name, $ok) {
  if ($ok) { $script:pass++; Write-Output "PASS: $name" }
  else { $script:fail++; Write-Output "FAIL: $name" }
}
function Login($email, $pw) {
  $b = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
  (Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post -ContentType 'application/json' -Body $b).token
}

# 1. Health
$h = (Invoke-RestMethod -Uri 'http://localhost:3001/health' -TimeoutSec 8).status
Check 'health endpoint' ($h -eq 'ok')

# 2. Auth
$demoToken = Login 'demo@bizzhouse.com' 'Demo@BizzHouse2026'
Check 'shop login' ($null -ne $demoToken -and $demoToken.Length -gt 50)
$demoHdr = @{ Authorization = "Bearer $demoToken" }

try { Login 'demo@bizzhouse.com' 'wrong-password' | Out-Null; Check 'bad login rejected' $false }
catch { Check 'bad login rejected' ($_.Exception.Response.StatusCode.value__ -eq 401) }

# 3. Registration (new shop)
$suffix = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$regBody = @{ email = "smoke$suffix@test.com"; password = 'Password123!'; name = 'Smoke Tester'; businessName = "Smoke Shop $suffix"; category = 'retail' } | ConvertTo-Json -Compress
$reg = Invoke-RestMethod -Uri "$BASE/auth/register" -Method Post -ContentType 'application/json' -Body $regBody
Check 'register creates user+shop+token' ($null -ne $reg.token -and $reg.shop.businessName -eq "Smoke Shop $suffix")

# 4. Wallet balance (new shop = 0)
$regHdr = @{ Authorization = "Bearer $($reg.token)" }
$bal = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $regHdr).balancePaise
Check 'new shop balance = 0' ($bal -eq 0)

# 5. Recharge loop (Phase 26)
$order = Invoke-RestMethod -Uri "$BASE/wallet/recharge" -Method Post -Headers $regHdr -ContentType 'application/json' -Body '{"amountPaise":20000}'
Check 'recharge order created' ($order.orderId -like 'order_mock_*')
$shopId = $reg.shop.id
$hook = @{ event = 'payment.captured'; payload = @{ payment = @{ entity = @{ id = "pay_smoke_$suffix"; amount = 20000; notes = @{ shopId = $shopId } } } } } | ConvertTo-Json -Depth 6 -Compress
$w = Invoke-RestMethod -Uri 'http://localhost:3001/webhooks/razorpay' -Method Post -ContentType 'application/json' -Body $hook
Check 'webhook credited 20000' ($w.processed -eq $true -and $w.newBalance -eq 20000)
Invoke-RestMethod -Uri 'http://localhost:3001/webhooks/razorpay' -Method Post -ContentType 'application/json' -Body $hook | Out-Null
$bal2 = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $regHdr).balancePaise
Check 'webhook replay idempotent' ($bal2 -eq 20000)

# 6. Contacts import (Phase 54)
$contacts = @(1..12 | ForEach-Object { @{ waId = "9198$((7654320 + $_).ToString())"; name = "Contact $_"; tags = @('smoke') } })
$imp = Invoke-RestMethod -Uri "$BASE/contacts/import" -Method Post -Headers $regHdr -ContentType 'application/json' -Body (@{ contacts = $contacts } | ConvertTo-Json -Depth 4 -Compress)
Check "import created 12 (got $($imp.created))" ($imp.created -eq 12)
$imp2 = Invoke-RestMethod -Uri "$BASE/contacts/import" -Method Post -Headers $regHdr -ContentType 'application/json' -Body (@{ contacts = $contacts } | ConvertTo-Json -Depth 4 -Compress)
Check "re-import creates 0 (got $($imp2.created))" ($imp2.created -eq 0)

# 7. Onboarding (Phase 33-34 backend)
$onb = Invoke-RestMethod -Uri "$BASE/gupshup/onboard" -Method Post -Headers $regHdr -ContentType 'application/json' -Body '{"onboardingType":"new_number"}'
Check 'onboarding returns app+link' ($null -ne $onb.appId -and $onb.embedSignupLink -like '*signup*')
$gsAppId = $onb.appId

# 7b. Simulate Phase 31 "app live" webhook (completes onboarding)
$liveHook = '{"gs_app_id":"' + $gsAppId + '","type":"app_event","event":"app_live","phone_number":"918000000000"}'
Invoke-RestMethod -Uri 'http://localhost:3001/webhooks/gupshup' -Method Post -ContentType 'application/json' -Body $liveHook | Out-Null
Start-Sleep -Seconds 3
$st = Invoke-RestMethod -Uri "$BASE/gupshup/status" -Headers $regHdr
Check 'app-live webhook flips waba to LIVE' ($st.app.wabaStatus -eq 'live')
Check 'shop auto-activated (Phase 36)' ($st.shopStatus -eq 'active')

# 8. Template submit + approve webhook (Phases 39-40)
$tpl = Invoke-RestMethod -Uri "$BASE/templates" -Method Post -Headers $regHdr -ContentType 'application/json' -Body (@{ elementName = "smoke_tpl_$suffix"; category = 'MARKETING'; body = 'Hi {{1}}!' } | ConvertTo-Json -Compress)
Check 'template submitted IN_REVIEW' ($tpl.status -eq 'IN_REVIEW')
$gsAppId2 = $onb.appId
$hook2 = '{"gs_app_id":"' + $gsAppId2 + '","type":"template_event","templates":[{"elementName":"smoke_tpl_' + $suffix + '","status":"APPROVED"}]}'
Invoke-RestMethod -Uri 'http://localhost:3001/webhooks/gupshup' -Method Post -ContentType 'application/json' -Body $hook2 | Out-Null
Start-Sleep -Seconds 3
$tpls = Invoke-RestMethod -Uri "$BASE/templates" -Headers $regHdr
$mine = $tpls | Where-Object { $_.elementName -eq "smoke_tpl_$suffix" } | Select-Object -First 1
Check 'template auto-approved via webhook' ($mine.status -eq 'APPROVED')

# 9. Send message (debits wallet, mock Gupshup)
$send = Invoke-RestMethod -Uri "$BASE/messages/send" -Method Post -Headers $regHdr -ContentType 'application/json' -Body (@{ contactWaId = '919876543299'; type = 'text'; text = 'Smoke test message' } | ConvertTo-Json -Compress)
Check 'message sent' ($null -ne $send.id -or $null -ne $send.messageId -or $null -ne $send.data)

# 10. Wallet debited (service = free within session, or marketing rate)
$bal3 = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $regHdr).balancePaise
Check "post-send balance sane ($bal3)" ($bal3 -ge 0 -and $bal3 -le 20000)

# 11. Admin debit + RBAC (Phase 57)
$adminToken = Login 'admin@bizzhouse.com' 'Admin@BizzHouse2026'
$adminHdr = @{ Authorization = "Bearer $adminToken" }
$adj = Invoke-RestMethod -Uri "$BASE/wallet/admin/debit" -Method Post -Headers $adminHdr -ContentType 'application/json' -Body (@{ shopId = $shopId; amountPaise = 1000; description = 'smoke audit' } | ConvertTo-Json -Compress)
Check 'admin debit works' ($adj.newBalancePaise -eq ($bal3 - 1000))
try { Invoke-RestMethod -Uri "$BASE/wallet/admin/debit" -Method Post -Headers $regHdr -ContentType 'application/json' -Body (@{ shopId = $shopId; amountPaise = 1 } | ConvertTo-Json -Compress) | Out-Null; Check 'RBAC blocks shop debit' $false }
catch { Check 'RBAC blocks shop debit' ($_.Exception.Response.StatusCode.value__ -eq 403) }

# 12. Tenant isolation: smoke shop sees only its own contacts
$myContacts = Invoke-RestMethod -Uri "$BASE/contacts?page=1&limit=100" -Headers $regHdr
$demoContacts = Invoke-RestMethod -Uri "$BASE/contacts?page=1&limit=100" -Headers $demoHdr
Check 'tenant isolation: contacts scoped' (($myContacts.data | Where-Object { $_.tags -contains 'csv-test' }).Count -eq 0)

Write-Output ''
Write-Output "════════════════════════════"
Write-Output "SMOKE RESULT: $pass passed, $fail failed"
