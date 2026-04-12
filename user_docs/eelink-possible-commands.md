# Eelink Possible Commands

Movara sends raw text to Eelink devices in the Advanced command console. The tracker still decides which commands are accepted, so use the exact syntax required by your hardware and firmware.

These are common Eelink commands documented in Eelink command manuals and matched to the command styles Movara already supports.

## Common queries

- `VERSION#` - firmware and version details
- `PARAM#` - APN, server, timer, SOS, timezone, and saving mode summary
- `STATUS#` - battery, GSM, GPS, ACC, relay, and power state
- `WHERE#` - current latitude, longitude, speed, and timestamp
- `URL#` - map link query
- `POSITION#` - address query
- `APN?` - query APN
- `SERVER?` - query server
- `TIMER?` - query GPS upload interval
- `GMT?` - query timezone
- `LANG?` - query language
- `CENTER?` - query center number

## Common setup commands

- `APN,CMNET#` - set APN without credentials
- `APN,internet,user,password#` - set APN with username and password
- `SERVER,1,hkgps.sky200.com,32001#` - set server by domain
- `SERVER,0,42.120.22.24,32001#` - set server by IP
- `TIMER,30#` - send one packet every 30 seconds
- `TIMER,15,8#` - gather every 15 seconds and upload every 8 packets
- `GMT,E,5,30#` - timezone east plus 5 hours 30 minutes
- `GMT,W,4#` - timezone west minus 4 hours
- `LANG,0#` - English
- `LANG,1#` - Chinese
- `CENTER,A,13800138000#` - set center number
- `CENTER,D#` - delete center number
- `SOS,A,13800138000,13800138001,13800138002#` - set SOS numbers
- `SOS,D,1#` - delete SOS slot 1
- `HBT,3#` - heartbeat interval in minutes
- `SAVING,1#` - saving mode
- `SHIFT,100#` - shift alarm at 100 meters
- `SHIFT,0#` - disable shift alarm
- `MOTION,2,5#` - vibration sensitivity and duration
- `FENCE,1,OR,,,500#` - circular out-fence around current point
- `FENCE,0#` - delete all fences
- `RELAY,1#` - cut oil / power
- `RELAY,0#` - restore oil / power
- `RESET#` - reboot device
- `FACTORY#` - factory reset

## OBD-oriented examples seen on Eelink units

- `OBD,03#` - request VIN on some OBD-capable models
- `OBD,15#` - clear fault codes on some OBD-capable models
- `MONITOR,02030405070A0B0C0D0E#` - configure monitored PIDs on some models

## Notes

- Many Eelink commands are case-insensitive, but keeping uppercase matches vendor examples.
- Some models reply with status text like `SET TIMER OK`, while others return more device-specific text.
- OBD commands vary more than core tracking commands, so confirm them against the exact tracker manual when possible.

## Sources

- Eelink command list: <https://www.eelinktech.com/command-list/>
- Eelink GPT06-T operation commands PDF: <https://www.eelinktech.com/PT06-T/GPT06-T%20temperature%20monitoring%20GPS_TRACKER_OPERATION_COMMANDS%28D%29.pdf>
