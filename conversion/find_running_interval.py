# import required packages
import json
import os
from datetime import datetime
import pytz


# specify the game
GAME = "hackaburg-campuswiese"

# load game data
data = json.load(open(os.path.join("data", GAME, "log-export/regular_status_update.json")))

# find first and last running timestamp
running_interval = {}
found_running = False
for entry in reversed(data): # log has newest entries at the top
    if not found_running and entry['game_state'] == 'RUNNING':
        found_running = True
        running_interval['start'] = entry['timestamp']
    if found_running and entry['game_state'] == 'OVER':
        running_interval['end'] = entry['timestamp']
        break

# convert to iso timestamp
for key in running_interval:
    timestamp = running_interval[key]
    timestamp = timestamp[:-4]
    dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S").replace(tzinfo=pytz.UTC)
    running_interval[key] = int(dt.timestamp() * 1000)
    
# print interval
print(running_interval)

# write interval to json
with open(os.path.join("data", GAME, "running_interval.json"), "w") as f:
    json.dump(running_interval, f)