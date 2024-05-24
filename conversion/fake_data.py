import json

start = 1716561247364
end = 1716562187836


with open("conversion/fake_data.txt") as file:
    lines = file.readlines()

lat_long = []

for line in lines:
    entries = line.split(" ")
    lat_long.append((float(entries[1]), float(entries[3])))

output = []
for i, (lat, lon) in enumerate(lat_long):
    factor = (i + 1) / (len(lat_long) + 2)
    timestamp = start + round((end - start) * factor)
    output.append(
        {
            "current_location": {
                "lat": lat,
                "lon": lon,
                "timestamp": timestamp,
            },
            "active_user": "2a539389-19d7-11ef-afee-e50b875d9764",
            "game_state": "RUNNING",
            "team_role": "RUNAWAYS",
            "team_color": "#84AE9B",
        }
    )

print(json.dumps(output, indent=4))
