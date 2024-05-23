import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import CubicSpline, PchipInterpolator, Akima1DInterpolator
import pandas as pd
import os
import json


json_dir = "data/log-by-user"

def numpyify_data():
    #team_lat = dict()
    #team_lon = dict()
    #team_timestamp = dict()
    teams = dict()
    for file_name in os.listdir(json_dir):
        full_name = os.path.join(json_dir, file_name)
        user_id = os.path.splitext(file_name)[0]
        with open(full_name) as file:
            data = json.load(file)
        data.sort(key=lambda d: d["current_location"]["timestamp"])
        lat = []
        lon = []
        timestamp = []
        for entry in data:
            c = entry["current_location"]
            lat.append(c["lat"])
            lon.append(c["lon"])
            timestamp.append(c["timestamp"])
        teams[user_id] = {
            "timestamp": np.array(timestamp),
            "lat": np.array(lat),
            "lon": np.array(lon),
        }
        #team_lat[user_id] = np.array(lat)
        #team_lon[user_id] = np.array(lon)
        #team_timestamp[user_id] = np.array(timestamp)
    #return team_lat, team_lon, team_timestamp
    return teams

def clamp_data(teams, num=1000):
    min_times = [np.min(team["timestamp"]) for team in teams.values()]
    max_times = [np.max(team["timestamp"]) for team in teams.values()]
    #team_lat, team_lon, team_timestamp,
    #min_times = [np.min(timestamp) for timestamp in team_timestamp.values()]
    #max_times = [np.max(timestamp) for timestamp in team_timestamp.values()]
    print("min times", np.array(sorted(min_times)) - min(min_times))
    print("max times", max(max_times) - np.array(sorted(max_times)))
    min_time = max(min_times)
    max_time = min(max_times)

    # We lose a lot of precision for large timestamps, so shift the region
    # of interest to lie near zero
    #nice_time = np.linspace(min_time, max_time, num)
    nice_time = np.linspace(0, max_time - min_time, num)
    nice_data = dict()
    for team, data in teams.items():
        spline_lat_pchip = PchipInterpolator(data["timestamp"] - min_time, data["lat"])
        spline_lon_pchip = PchipInterpolator(data["timestamp"] - min_time, data["lon"])
        nice_data[team] = {
            "lat": spline_lat_pchip(nice_time),
            "lon": spline_lon_pchip(nice_time),
        }
    return min_time, nice_time, nice_data

def pandaify_data(time, data):
    columns = pd.MultiIndex.from_product([data.keys(), ["lat", "lon"]], names=["team", "dim"])
    #print(columns)
    df = pd.DataFrame(np.zeros([len(time), 2*len(data)]), index=time, columns=columns)
    #df = pd.DataFrame.from_dict(data)
    for team, entry in data.items():
        df[team, "lat"] = entry["lat"]
        df[team, "lon"] = entry["lon"]
    #print(df.head())
    return df


teams = numpyify_data()
offset, nice_time, nice_data = clamp_data(teams)
# Check if catastrophic cancelation occured:
#print(float.hex(nice_time[1] - nice_time[0]))
df = pandaify_data(nice_time, nice_data)

# Multiindices do not survive the conversion to csv and back
#df.to_csv("data/log-interpol/interpol.csv")
#df2 = pd.read_csv("data/log-interpol/interpol.csv")

df.to_parquet("data/log-interpol/interpol.parquet")

# How to read the data:

df_from_file = pd.read_parquet("data/log-interpol/interpol.parquet")

#print(df.head())
#print(df_from_file.head())

# Then we have
timestamps = df_from_file.index
# and e.g.
team_28_lat = df_from_file["284f0e6b-1514-11ef-a3d1-710a0d2c97dd", "lat"]
team_28_lon = df_from_file["284f0e6b-1514-11ef-a3d1-710a0d2c97dd", "lon"]

#print(np.array(timestamps)[:10])
#print(np.array(team_28_lat)[:10])
#print(np.array(team_28_lon)[:10])
