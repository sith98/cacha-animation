import numpy as np
import pandas as pd
from scipy.interpolate import PchipInterpolator
#import matplotlib.pyplot as plt
import os
import json
from pathlib import Path

def main(time_step_ms):
    for game_name in os.listdir("data/"):
        teams = dict()
        for team_json in os.listdir(f"data/{game_name}/log-by-user/"):
            team_name = team_json.rstrip(".json")
            team_dataframe = json_to_dataframe(f"data/{game_name}/log-by-user/{team_json}")
            teams[team_name] = team_dataframe
        df = consolidate_data(teams, time_step_ms)
        Path(f"data/{game_name}/log-interpol").mkdir(parents=True, exist_ok=True)
        df.to_parquet(f"data/{game_name}/log-interpol/interpol.parquet")

def json_to_dataframe(path):
    with open(path) as file:
        data = json.load(file)
    data.sort(key=lambda entry: entry["current_location"]["timestamp"])
    lat = []
    lon = []
    timestamp = []
    for entry in data:
        c = entry["current_location"]
        lat.append(c["lat"])
        lon.append(c["lon"])
        timestamp.append(c["timestamp"])
    coords = np.array([lat, lon]).T
    df = pd.DataFrame(coords, index=timestamp, columns=["lat", "lon"])
    return df

def consolidate_data(teams, time_step_ms):
    min_times = [np.min(team_dataframe.index) for team_dataframe in teams.values()]
    max_times = [np.max(team_dataframe.index) for team_dataframe in teams.values()]
    #print("min times", np.array(sorted(min_times)) - min(min_times))
    #print("max times", max(max_times) - np.array(sorted(max_times)))
    min_time = max(min_times)
    max_time = min(max_times)
    # We lose a lot of precision for large timestamps, so shift the region
    # of interest to lie near zero
    time_equi = np.arange(0, max_time - min_time, time_step_ms)
    columns = pd.MultiIndex.from_product([teams.keys(), ["lat", "lon"]], names=["team_name", "dim"])
    df = pd.DataFrame(index=time_equi+min_time, columns=columns)
    for team_name, team_dataframe in teams.items():
        spline_lat = PchipInterpolator(team_dataframe.index - min_time, team_dataframe["lat"])
        spline_lon = PchipInterpolator(team_dataframe.index - min_time, team_dataframe["lon"])
        df[team_name, "lat"] = spline_lat(time_equi)
        df[team_name, "lon"] = spline_lon(time_equi)
    return df

if __name__ == "__main__":
    main(time_step_ms=1000)
