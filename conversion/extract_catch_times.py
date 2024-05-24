import json
import datetime

with open(
    "data-by-game/hackaburg-campuswiese/log-export/regular_status_update.json"
) as file:
    data = json.load(file)

hunter_times = {}

for entry in data:
    if entry["team_role"] != "HUNTER":
        continue

    user = entry["active_user"]
    if user not in hunter_times:
        hunter_times[user] = []

    hunter_times[user].append(entry["current_location"]["timestamp"])


for user, times in hunter_times.items():
    time = min(times) / 1000
    d = datetime.datetime.fromtimestamp(time).astimezone(datetime.UTC)
    print(user, d)
