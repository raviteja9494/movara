/**
 * Print the LAN URL so you can open Movara from your phone (same WiFi).
 * Run before or with dev server: node scripts/show-lan-url.cjs
 */
const os = require('os');

function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const a = iface.address;
      if (a.startsWith('169.254.')) continue; // link-local, skip
      candidates.push(a);
      if (a.startsWith('192.168.') || a.startsWith('10.')) return a; // prefer real LAN
    }
  }
  return candidates[0] || null;
}

const ip = getLanIp();
const port = 5173;
if (ip) {
  console.log('');
  console.log('  On your phone (same WiFi), use this URL in the Movara app:');
  console.log('  \x1b[1m\x1b[32m  http://' + ip + ':' + port + '\x1b[0m');
  console.log('');
  console.log('  If it does not load: Windows Firewall may be blocking. Run in PowerShell (Admin):');
  console.log('  \x1b[33m  New-NetFirewallRule -DisplayName "Movara" -Direction Inbound -Protocol TCP -LocalPort ' + port + ' -Action Allow\x1b[0m');
  console.log('');
} else {
  console.log('  Could not detect LAN IP. Run  ipconfig  and use the IPv4 address of your WiFi adapter (e.g. 192.168.1.x).');
}
