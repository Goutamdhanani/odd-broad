$ErrorActionPreference = 'Stop'
$BASE = 'http://localhost:3001/api'

function Login($email, $pw) {
  $b = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
  (Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post -ContentType 'application/json' -Body $b).token
}

$demoToken = Login 'demo@bizzhouse.com' 'Demo@BizzHouse2026'
$demoHdr = @{ Authorization = "Bearer $demoToken" }

$balBefore = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $demoHdr).balancePaise
Write-Output "balance before: $balBefore"

# ── Phase 23: create order ──
$orderBody = @{ amountPaise = 25000 } | ConvertTo-Json -Compress
$order = Invoke-RestMethod -Uri "$BASE/wallet/recharge" -Method Post -Headers $demoHdr -ContentType 'application/json' -Body $orderBody
Write-Output "order: id=$($order.orderId) amount=$($order.amountPaise) mock=$($order.mock)"
if ($order.orderId -notlike 'order_mock_*') { throw 'expected mock order id' }

# ── Phase 24/25: mock payment.captured webhook (mock mode trusts payload) ──
$hookBody = @{
  event = 'payment.captured'
  payload = @{
    payment = @{
      entity = @{
        id = "pay_test_$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
        amount = 25000
        notes = @{ shopId = '6f7d7a9f-1444-4558-a634-2df16c9287fb' }
      }
    }
  }
} | ConvertTo-Json -Depth 6 -Compress

$res = Invoke-RestMethod -Uri 'http://localhost:3001/webhooks/razorpay' -Method Post -ContentType 'application/json' -Body $hookBody
Write-Output "webhook: $($res | ConvertTo-Json -Compress)"

$balAfter1 = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $demoHdr).balancePaise
Write-Output "balance after webhook: $balAfter1 (delta $($balAfter1 - $balBefore), expected 25000)"

# ── Idempotency: replay the SAME webhook ──
$res2 = Invoke-RestMethod -Uri 'http://localhost:3001/webhooks/razorpay' -Method Post -ContentType 'application/json' -Body $hookBody
$balAfter2 = (Invoke-RestMethod -Uri "$BASE/wallet/balance" -Headers $demoHdr).balancePaise
Write-Output "after replay: $balAfter2 (must equal $balAfter1)"
if ($balAfter2 -ne $balAfter1) { Write-Output 'IDEMPOTENCY FAIL: double credit!' } else { Write-Output 'IDEMPOTENCY OK: no double credit' }

# ── Ledger shows the recharge ──
$txs = Invoke-RestMethod -Uri "$BASE/wallet/transactions?page=1&limit=3" -Headers $demoHdr
$top = $txs.data | Where-Object { $_.type -eq 'topup' } | Select-Object -First 1
Write-Output "ledger top: type=$($top.type) amount=$($top.amountPaise) ref=$($top.referenceId)"
