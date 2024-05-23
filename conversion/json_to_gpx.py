import gpxpy
import gpxpy.gpx
import os
import json
import datetime

json_dir = "data/log-by-user"


def main():
    gpx = gpxpy.gpx.GPX()
    gpx.name = "combined"
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

        # Create points:
        for d in data:
            location = d["current_location"]
            gpx_segment.points.append(
                gpxpy.gpx.GPXTrackPoint(
                    location["lat"],
                    location["lon"],
                    time=datetime.datetime.fromtimestamp(
                        location["timestamp"] / 1000, datetime.UTC
                    ),
                )
            )
        gpx.tracks.append(gpx_track)
        user_gpx.tracks.append(gpx_track)

        user_gpx.name = user_id
        with open(f"data/gpx/{user_id}.gpx", "w") as file:
            file.write(user_gpx.to_xml())
    with open(f"data/gpx/combined.gpx", "w") as file:
        file.write(gpx.to_xml())


main()
