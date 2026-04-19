# GT06 EV26R-Style Commands

Movara sends GT06 custom commands as raw text inside the GT06 downlink frame, so the command you type in Advanced should exactly match the tracker command syntax.

This note is intentionally limited to the `#`-style GT06 / EV26R command family that matches your tracker responses. Older password-style GT06 manuals were removed here because they are a different command family and are likely to confuse testing on this unit.

## Confirmed query commands from Movara log

These were verified against raw GT06 `0x21` response packets in the Movara log from `2026-04-19`:

- `VERSION#` -> `[VERSION]EV26R_EV26R_WAAM_Markon_V10.4_250322.1353`
- `STATUS#` -> `Battery:3.96V,NORMAL; GPRS:Link Up,GPRS2:Link Down; GSM Signal Level:Strong; GPS:OFF; ACC:OFF; Defense:OFF;`
- `WHERE#` -> `Last position! 
- `GMT#` -> `GMT:E,5,30 (AUTO)`
- `POWERALM#` -> `POWERALM:ON,2,10,1`
- `BATALM#` -> `BATALM: ON, 1`
- `SPEED#` -> `SPEED:OFF,20,50,1`
- `SENALM#` -> `SENALM:OFF,1`
- `CENTER#` -> `CENTER:`
- `GPRS#` -> `invalid command!`

## Relevant set commands for this command family

These command forms match the same firmware family based on GT06 command references and are the most relevant follow-ups to the queries that already worked for you.

### Version, status, and location

- `STATUS#` - query current device status
- `WHERE#` - query last known position
- `VERSION#` - query firmware version

### Center number

- `CENTER#` - query current center number
- `CENTER,A,<number>#` - set primary center number
- `CENTER,A2,<number>#` - set secondary center number
- `CENTER,A3,<number>#` - set tertiary center number
- `CENTER,D#` - delete primary center number
- `CENTER,D2#` - delete secondary center number
- `CENTER,D3#` - delete tertiary center number

### Timezone

- `GMT#` - query timezone
- `GMT,E,5,30#` - set timezone to UTC+05:30
- `GMT,W,4,0#` - example for UTC-04:00

Meaning:
- first parameter: `E` east or `W` west
- second parameter: hour offset `0-12`
- third parameter: minute offset `0/15/30/45`

### Power-loss alarm

- `POWERALM#` - query power-loss alarm
- `POWERALM,ON,2,10,1#` - enable power-loss alarm with the same settings your tracker reported
- `POWERALM,OFF#` - disable power-loss alarm

Observed response fields:
- `POWERALM:ON,2,10,1`
- interpreted as enabled, alarm mode `2`, detect delay `10s`, charge-time parameter `1s`

### Low-battery alarm

- `BATALM#` - query low-battery alarm
- `BATALM,ON,1#` - enable low-battery alarm in the same mode your tracker reported
- `BATALM,OFF#` - disable low-battery alarm

Observed response fields:
- `BATALM:ON,1`
- interpreted as enabled plus alarm mode `1`

### Overspeed alarm

- `SPEED#` - query overspeed alarm
- `SPEED,ON,10,120,1#` - example enable command from GT06 references
- `SPEED,OFF#` - disable overspeed alarm

Meaning from GT06 command references:
- first parameter after `ON`: overspeed duration in seconds
- second parameter: speed threshold in km/h
- third parameter: alarm mode

Your tracker currently reported:
- `SPEED:OFF,20,50,1`

That means this unit understands the command family even though the feature is currently off.

### Vibration / sensor alarm

- `SENALM#` - query vibration alarm
- `SENALM,ON,1#` - enable vibration alarm
- `SENALM,OFF#` - disable vibration alarm

Your tracker currently reported:
- `SENALM:OFF,1`

### APN / GPRS family

- `APN#` - likely query current APN
- `APN,<apn>#` - likely set APN
- `APN,<apn>,<user>,<password>#` - likely set APN with credentials

Important:
- `GPRS#` was rejected by your tracker with `invalid command!`
- so for this firmware, APN/GPRS settings likely belong to the `APN...#` command family, not the plain `GPRS#` query

### Server

- `SERVER#` - query current server target
- `SERVER,1,<domain>,<port>,0#` - set by domain
- `SERVER,0,<ip>,<port>,0#` - set by IP

Use this carefully because it changes where the tracker reports.

## Practical notes for this tracker

- `STATUS#`, `VERSION#`, `WHERE#`, `GMT#`, `CENTER#`, `POWERALM#`, `BATALM#`, `SPEED#`, and `SENALM#` are confirmed working on this firmware.
- `CENTER#` returned an empty value, so no center number appears to be configured right now.
- `GPRS#` is not the correct command on this firmware.
- `WHERE#` returns the last known location, not necessarily a fresh live fix at that exact moment.
- `STATUS#` is the best quick command for checking battery voltage, GPRS state, GSM signal wording, GPS state, ACC, and defense state.

## Sources

- Smart Tracker GT06 manual summary on ManualsLib: <https://www.manualslib.com/manual/754200/Smart-Tracker-Gt06.html>
- GT06 command reference snippet covering `CENTER`, `SPEED`, `POWERALM`, `BATALM`, `GMT`, `SERVER`: <https://www.scribd.com/document/863962480/GT06-SMS-Commands>
- GT06 command reference snippet covering `SENALM`, `POWERALM`, `BATALM`, `SPEED`, `GMT`: <https://www.scribd.com/document/826761064/Gt06-sms>
- M16 / GT06 command summary snippet covering `STATUS#`, `WHERE#`, `VERSION#`, `CENTER`, `APN`, and `GMT`: <https://www.scribd.com/document/1007732725/ZHENcb-M16-GT06-4G-GPS-TRACKER-MANUAL-202405>
