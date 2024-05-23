import gpxpy
import gpxpy.gpx
import os
import json
import datetime

json_dir = "data/log-by-user"


def parse_team_caught():
    with open("data/log-export/team_caught.json") as file:
        data = json.load(file)

    catch_times = {}
    for entry in data:
        catch_times[entry["runaway_active_user"]] = datetime.datetime.fromisoformat(
            entry["timestamp"] + "Z"
        ).timestamp()

    catch_times[data[-1]["hunter_active_user"]] = 0.0
    return catch_times


def main():
    catch_times = parse_team_caught()
    all_points = []
    for file_name in os.listdir(json_dir):
        full_name = os.path.join(json_dir, file_name)
        user_id = os.path.splitext(file_name)[0]
        with open(full_name) as file:
            data = json.load(file)
        data.sort(key=lambda d: d["current_location"]["timestamp"])

        user_gpx = gpxpy.gpx.GPX()
        # Create first track in our GPX:
        gpx_track = gpxpy.gpx.GPXTrack()

        # Create first segment in our GPX track:
        gpx_segment = gpxpy.gpx.GPXTrackSegment()
        gpx_track.segments.append(gpx_segment)

        points = []
        hunter_points = []
        runaway_points = []

        # Create points:
        for d in data:
            location = d["current_location"]
            time = datetime.datetime.fromtimestamp(
                location["timestamp"] / 1000, datetime.UTC
            )
            point = gpxpy.gpx.GPXTrackPoint(
                location["lat"],
                location["lon"],
                time=time,
            )
            points.append(point)
            if user_id not in catch_times or catch_times[user_id] > time.timestamp():
                runaway_points.append(point)
            else:
                hunter_points.append(point)

        write_gpx([points], user_id, f"data/gpx/{user_id}.gpx")
        write_gpx(
            [hunter_points], f"hunter_{user_id}", f"data/gpx/hunter/{user_id}.gpx"
        )
        write_gpx(
            [runaway_points], f"runaway_{user_id}", f"data/gpx/runaway/{user_id}.gpx"
        )
        all_points.append(points)
    write_gpx(all_points, "combined", "data/gpx/combined.gpx")


def write_gpx(point_lists, name, url):
    gpx = gpxpy.gpx.GPX()
    gpx.name = name
    # Create first track in our GPX:
    for point_list in point_lists:
        gpx_track = gpxpy.gpx.GPXTrack()
        gpx.tracks.append(gpx_track)

        # Create first segment in our GPX track:
        gpx_segment = gpxpy.gpx.GPXTrackSegment()
        gpx_track.segments.append(gpx_segment)
        gpx_segment.points.extend(point_list)
    with open(url, "w") as file:
        file.write(gpx.to_xml())


main()
