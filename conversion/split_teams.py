import json
import os


for subdir in os.listdir("data/"):
    with open(f"data/{subdir}/log-export/regular_status_update.json") as file:
        data = json.load(file)

    by_user = {}

    for entry in data:
        user = entry["active_user"]
        if user not in by_user:
            by_user[user] = []
        by_user[user].append(entry)

    for user, data in by_user.items():
        with open(f"data/{subdir}/log-by-user/{user}.json", "w") as file:
            json.dump(data, file, indent=4)
