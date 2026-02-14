# GT06 Simulator

Sends GT06 protocol packets to Movara's GT06 server for testing.

**Requirements:** Python 3.6+

**Usage:**

```bash
# Default: 127.0.0.1:5051, sends login then GPS every 10s
python gt06_simulator.py

# Custom host and port
python gt06_simulator.py 192.168.8.22 5051

# Single run: login + one GPS then exit (for CI or quick test)
python gt06_simulator.py --once
python gt06_simulator.py 127.0.0.1 5051 --once
```

Ensure Movara backend is running and the GT06 server is listening on port 5051.
