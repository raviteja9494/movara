# GT06 Possible Commands

Movara now sends GT06 custom commands as raw text inside the GT06 downlink frame, so the command you type in Advanced should match the syntax expected by your tracker manual.

GT06-family devices are much less consistent than Eelink devices. Different GT06, GT06N, GT06E, and clone firmwares often use different passwords and command words, so treat the list below as a starting point, not a universal command set.

## Common setup commands

- `IP 198.11.175.123 9026` - set server IP and port
- `PASSWORD,123456,888888` - change SMS password
- `apn,123456,internet` - set APN
- `apnuser,123456,username` - set APN username
- `apnpasswd,123456,password` - set APN password
- `101#+8612345678910#` - set admin phone number
- `D101#` - delete admin phone number
- `102#+8612345678911#` - set SOS 1 number
- `103#+8612345678912#` - set SOS 2 number
- `freq,123456,20` - ACC-on upload interval in seconds
- `static,123456,60` - ACC-off upload interval in seconds
- `sleep,123456,10` - sleep after 10 minutes of inactivity
- `zone123456 e08` - timezone plus 8
- `zone123456 w04` - timezone minus 4

## Common query and control commands

- `G1234` - request Google Maps link
- `CXZT` - query tracker status
- `CQ` - reboot device
- `FORMAT` - factory reset
- `DY` - cut engine / oil
- `KY` - restore engine / oil
- `88` - voice monitor on supported units

## Notes

- A lot of GT06 commands require the SMS password inside the command text, often `123456` on factory-default units.
- Some GT06 manuals use uppercase command words, some use lowercase, and some clones mix both.
- If a command does not work, the most likely causes are a different password, a firmware-specific command variant, or a clone model using a different GT06 command family.
- For Movara custom commands, paste the exact raw string from your tracker manual rather than trying to normalize it.

## Sources

- GT06 command guide summary: <https://ru.scribd.com/document/394002681/GT06N>
- Anbtek GT06 vehicle tracker manual: <https://manuals.plus/anbtek/gt06-vehicle-gps-tracker-manual>
