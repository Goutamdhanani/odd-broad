$ErrorActionPreference = 'Stop'
$BASE = 'http://localhost:3001/api'

function Login($email, $pw) {
  $b = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
  (Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post -ContentType 'application/json' -Body $b).token
}

$demoToken = Login 'demo@bizzhouse.com' 'Demo@BizzHouse2026'
$adminToken = Login 'admin@123' 'password@123'
$demoHdr = @{ Authorization = "Bearer $demoToken" }
$adminHdr = @{ Authorization = "Bearer $adminToken" }

$shops = Invoke-RestMethod -Uri "$BASE/shops/admin/all" -Headers $adminHdr
$demoShop = $shops.data | Where-Object { $_.businessName -like '*Demo*' } | Select-Object -First 1
$shopId = $demoShop.id
Write-Output "shop: $($demoShop.businessName) id=$shopId"

$balBefore = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $demoHdr).balancePaise
Write-Output "balance before: $balBefore"

# ── Phase 57: admin debit with reason ──
$debitBody = @{ shopId = $shopId; amountPaise = 2500; description = 'Promotional campaign adjustment - audit test' } | ConvertTo-Json -Compress
$adj = Invoke-RestMethod -Uri "$BASE/wallet/admin/debit" -Method Post -Headers $adminHdr -ContentType 'application/json' -Body $debitBody
Write-Output "debit result: $($adj | ConvertTo-Json -Compress)"

$balAfter = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $demoHdr).balancePaise
Write-Output "balance after: $balAfter (delta $($balBefore - $balAfter), expected 2500)"

# ── Audit trail visible in shop's own history ──
$txs = Invoke-RestMethod -Uri "$BASE/wallet/transactions?page=1&limit=5" -Headers $demoHdr
$latest = $txs.data[0]
Write-Output "latest tx: type=$($latest.type) amount=$($latest.amountPaise) desc='$($latest.description)'"

# ── RBAC: shop token must NOT be able to debit ──
try {
  Invoke-RestMethod -Uri "$BASE/wallet/admin/debit" -Method Post -Headers $demoHdr -ContentType 'application/json' -Body $debitBody | Out-Null
  Write-Output 'RBAC FAIL: shop token debited!'
} catch {
  Write-Output "RBAC OK: shop token rejected with $($_.Exception.Response.StatusCode.value__)"
}

# ── Debit beyond balance must fail ──
$hugeBody = @{ shopId = $shopId; amountPaise = 999999999; description = 'overdraft attempt' } | ConvertTo-Json -Compress
try {
  Invoke-RestMethod -Uri "$BASE/wallet/admin/debit" -Method Post -Headers $adminHdr -ContentType 'application/json' -Body $hugeBody | Out-Null
  Write-Output 'OVERDRAFT FAIL: huge debit succeeded!'
} catch {
  Write-Output "OVERDRAFT OK: rejected with $($_.Exception.Response.StatusCode.value__)"
}
