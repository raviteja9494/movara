# Run this in PowerShell as Administrator to allow Movara dev server from your phone.
# Right-click PowerShell -> Run as administrator, then:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   cd path\to\movara\webui\scripts
#   .\allow-firewall-windows.ps1

$port = 5173
$ruleName = "Movara Web UI (port $port)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Rule '$ruleName' already exists."
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow
    Write-Host "Added firewall rule: $ruleName"
}
Write-Host "Restart the webui dev server (npm run dev) and try from your phone again."
