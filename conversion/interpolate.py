import numpy as np
import pandas as pd
from scipy.interpolate import PchipInterpolator
import matplotlib.pyplot as plt
import seaborn as sns
import os
import json
import copy
from pathlib import Path

sns.set_theme()

def main(time_step_ms, inactive_after_ms):
    for game_name in os.listdir("data/"):
        teams = dict()
        for team_json in os.listdir(f"data/{game_name}/log-by-user/"):
            team_name = team_json.rstrip(".json")
            team_dataframe = json_to_dataframe(f"data/{game_name}/log-by-user/{team_json}")
            teams[team_name] = team_dataframe
        interpol_dataframe = consolidate_data(teams, time_step_ms)
        Path(f"data/{game_name}/log-interpol").mkdir(parents=True, exist_ok=True)
        interpol_dataframe.to_parquet(f"data/{game_name}/log-interpol/interpol.parquet")
        time_equi = interpol_dataframe.index
        connection_dataframe = connection_status(time_equi, teams, inactive_after_ms)
        connection_dataframe.to_parquet(f"data/{game_name}/log-interpol/connection.parquet")
        cumulative_distance = make_cumulative_distance(interpol_dataframe, teams)
        # Write back to json
        result_json = []
        for team_json in os.listdir(f"data/{game_name}/log-by-user/"):
            with open(f"data/{game_name}/log-by-user/{team_json}") as file:
                json_data = json.load(file)
            json_data.sort(key=lambda entry: entry["current_location"]["timestamp"])
            team_name = team_json.rstrip(".json")
            #team_dataframe = teams[team_name]
            current_json_index = 0
            while json_data[current_json_index+1]["current_location"]["timestamp"] < time_equi[0]:
                next_json_entry = copy.deepcopy(json_data[current_json_index])
                next_json_entry["is_connection_active"] = True
                next_json_entry["is_interpolated"] = False
                next_json_entry["cumulative_distance"] = 0.0
                result_json.append(next_json_entry)
                current_json_index += 1
            for t in time_equi:
                while json_data[current_json_index+1]["current_location"]["timestamp"] < t:
                    next_json_entry = copy.deepcopy(json_data[current_json_index])
                    next_json_entry["is_connection_active"] = True
                    next_json_entry["is_interpolated"] = False
                    next_json_entry["cumulative_distance"] = float(result_json[-1]["cumulative_distance"])
                    result_json.append(next_json_entry)
                    current_json_index += 1
                assert json_data[current_json_index]["current_location"]["timestamp"] <= t
                next_json_entry = copy.deepcopy(json_data[current_json_index])
                next_json_entry["current_location"]["timestamp"] = t
                next_json_entry["current_location"]["lat"] = interpol_dataframe[team_name, "lat"][t]
                next_json_entry["current_location"]["lon"] = interpol_dataframe[team_name, "lon"][t]
                next_json_entry["is_connection_active"] = bool(connection_dataframe[team_name][t])
                next_json_entry["is_interpolated"] = True
                next_json_entry["cumulative_distance"] = float(cumulative_distance[team_name][t])
                result_json.append(next_json_entry)
            while current_json_index+1 < len(json_data):
                next_json_entry = copy.deepcopy(json_data[current_json_index])
                next_json_entry["is_connection_active"] = True
                next_json_entry["is_interpolated"] = False
                next_json_entry["cumulative_distance"] = float(result_json[-1]["cumulative_distance"])
                result_json.append(next_json_entry)
                current_json_index += 1
        with open(f"data/{game_name}/log-interpol/interpol.json", "w") as file:
            json.dump(result_json, file, indent=4)

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
    team_dataframe = pd.DataFrame(coords, index=timestamp, columns=["lat", "lon"])
    return team_dataframe

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
    interpol_dataframe = pd.DataFrame(index=time_equi+min_time, columns=columns)
    for team_name, team_dataframe in teams.items():
        spline_lat = PchipInterpolator(team_dataframe.index - min_time, team_dataframe["lat"])
        spline_lon = PchipInterpolator(team_dataframe.index - min_time, team_dataframe["lon"])
        interpol_dataframe[team_name, "lat"] = spline_lat(time_equi)
        interpol_dataframe[team_name, "lon"] = spline_lon(time_equi)
    return interpol_dataframe

def connection_status(time_equi, teams, inactive_after_ms):
    # assume time contains equidistant points
    time_step = time_equi[1] - time_equi[0]
    num_points = inactive_after_ms // time_step
    connection_dataframe = pd.DataFrame(index=time_equi, columns=teams.keys())
    for team_name, team_dataframe in teams.items():
        time_raw = team_dataframe.index
        active_connection = np.full(len(time_equi), True)
        current_raw_index = 0
        for i, t in enumerate(time_equi):
            while current_raw_index+1 < len(time_raw) and time_raw[current_raw_index+1] < t:
                current_raw_index += 1
            assert time_raw[current_raw_index] <= t
            if t - time_raw[current_raw_index] > inactive_after_ms:
                active_connection[i] = False
        #plt.plot(time_equi, active_connection)
        #plt.show()
        connection_dataframe[team_name] = active_connection
    return connection_dataframe

def make_cumulative_distance(interpol_dataframe, teams):
    #print(interpol_dataframe.head())
    earth_radius_in_meters = 6_371_008.8
    df = pd.DataFrame(index=interpol_dataframe.index, columns=teams.keys())
    for team_name in teams.keys():
        lat = np.deg2rad(interpol_dataframe[team_name]["lat"].to_numpy())
        lon = np.deg2rad(interpol_dataframe[team_name]["lon"].to_numpy())
        x = earth_radius_in_meters * np.cos(lat) * np.cos(lon)
        y = earth_radius_in_meters * np.cos(lat) * np.sin(lon)
        z = earth_radius_in_meters * np.sin(lat)
        diff_x = np.zeros_like(x)
        diff_y = np.zeros_like(y)
        diff_z = np.zeros_like(z)
        diff_x[1:] = x[1:] - x[:-1]
        diff_y[1:] = y[1:] - y[:-1]
        diff_z[1:] = z[1:] - z[:-1]
        distance = np.hypot(diff_x, np.hypot(diff_y, diff_z))
        cum_distance = np.cumsum(distance)
        #plt.plot(cum_distance)
        df[team_name] = cum_distance
    #sns.relplot(data=df, kind="line")
    #plt.show()
    #print(df.head())
    return df


if __name__ == "__main__":
    main(time_step_ms=5000, inactive_after_ms=30_000)
