# import required packages
import json
import os
import pandas as pd
from datetime import datetime
import pytz
import itertools

# specify game
GAME = "hackaburg-campuswiese"

# load interpolated data
df = pd.read_parquet(os.path.join("data", GAME, "log-interpol/interpol.parquet"))

# get list of teams
teams = list(set(c[0] for c in df.columns))
teams

# get catch data
data_caught = json.load(open(os.path.join('data/', GAME, "log-export/team_caught.json")))

# dictionary of caught timestamps
caught_timestamps = {}
for entry in data_caught:
    entry['timestamp'] = entry['timestamp'][:-4]
    entry['timestamp'] = entry['timestamp']
    dt = datetime.strptime(entry['timestamp'], "%Y-%m-%d %H:%M:%S").replace(tzinfo=pytz.UTC)
    caught_timestamps[entry['runaway_active_user']] = int(dt.timestamp() * 1000)
# initial hunting team
entry = data_caught[-1]
caught_timestamps

# get initial hunter
initial_hunter = entry['hunter_active_user']
caught_timestamps[initial_hunter] = 0

# find intervals where hunters are close to prey
interesting_timestamps = []
interesting_start = 0
interesting = False
for t in df.index:
    hunters = [initial_hunter] + [team for team in teams if team in caught_timestamps.keys() and caught_timestamps[team] < t]
    preys = [team for team in teams if team not in hunters]
    
    # calculate pairwise distances between hunters and prey
    still_interesting = False
    for hunter, prey in itertools.product(hunters, preys):
        d_lat = df[hunter, 'lat'][t] - df[prey, 'lat'][t]
        d_lon = df[hunter, 'lon'][t] - df[prey, 'lon'][t]
        d = ((d_lat*1000)**2 + (d_lon*1000)**2)**0.5
        if d < 0.5:
            if not interesting:
                interesting_start = t
            still_interesting = True
            interesting = True
            break
    
    # end of interesting period
    if interesting and not still_interesting:
        interesting_timestamps.append({'start': interesting_start, 'end': t})
        interesting = False
interesting_timestamps.append({'start': interesting_start, 'end': t})
print("Interesting timestamps:")
print(interesting_timestamps)

# load game running interval
running_interval = json.load(open(os.path.join('data', GAME, "running_interval.json")))
print("Game running interval:")
running_interval

# filter game running interval
interesting_timestamps = [ts for ts in interesting_timestamps if ts['start'] > running_interval['start'] and ts['end'] < running_interval['end']]
print("Filtered interesting timestamps:")
print(interesting_timestamps)

# write interesting timestamps to json
with open(os.path.join('data', GAME, "interesting_timestamps.json"), "w") as f:
    json.dump(interesting_timestamps, f, indent=4)