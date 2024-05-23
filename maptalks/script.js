const loadJson = () => {
    return Promise.all(["regular_status_update.json", "team_caught.json"].map(url => {
        return fetch(url).then(res => res.json());
    }))
}

const parseStatusUpdate = json => {
    const byUser = {};
    for (const entry of json) {
        const userId = entry.active_user
        if (!(userId in byUser)) {
            byUser[userId] = [];
        }
        byUser[userId].push({
            lat: entry.current_location.lat,
            lon: entry.current_location.lon,
            time: entry.current_location.timestamp,
        })
    }
    for (const array of Object.values(byUser)) {
        array.sort((a, b) => a.time - b.time);
    }
    return byUser;
}

const getLocationByTime = (locations, time) => {
    let matchIndex = null;
    for (const [index, entry] of locations.entries()) {
        if (time < entry.time) {
            matchIndex = index;
            break;
        }
    }
    let entry;
    if (matchIndex === null) {
        entry = locations[locations.length - 1];
    } else if (matchIndex === 0) {
        entry = locations[0]
    } else {
        const first = locations[matchIndex - 1];
        const second = locations[matchIndex];
        const factor = (time - first.time) / (second.time - first.time)
        entry = {
            lat: first.lat + factor * (second.lat - first.lat),
            lon: first.lon + factor * (second.lon - first.lon),
        }
    }
    return entry;
}

const getCatchTimeStamp = (isoTime) => {
    return new Date(isoTime).getTime() + 7200000;
}

const getCatchTimes = (teamCaught, minTime) => {
    const catchTimes = {};
    for (const entry of teamCaught) {
        catchTimes[entry.runaway_active_user] = getCatchTimeStamp(entry.timestamp)
    }

    const lastEvent = teamCaught[teamCaught.length - 1];

    catchTimes[lastEvent.hunter_active_user] = minTime;
    return catchTimes;
}

const getMeta = (locations) => {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    let minTime = null;
    let maxTime = null;

    for (const array of Object.values(locations)) {
        for (const { lon, lat, time } of array) {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);

            if (minTime === null || time < minTime) {
                minTime = time;
            }
            if (maxTime === null || time > maxTime) {
                maxTime = time;
            }
        }
    }
    return {
        centerLat: (minLat + maxLat) / 2,
        centerLon: (minLon + maxLon) / 2,
        minTime,
        maxTime,
    }
}

const main = async () => {
    const [statusUpdate, teamCaught] = await loadJson();

    const locations = parseStatusUpdate(statusUpdate)
    const meta = getMeta(locations)
    const catchTimes = getCatchTimes(teamCaught, meta.minTime);

    const timeSlider = document.querySelector("#time");
    timeSlider.min = meta.minTime;
    timeSlider.max = meta.maxTime;

    const centerTime = meta.minTime + 0.5 * (meta.maxTime - meta.minTime);

    const map = new maptalks.Map('map', {
        center: [meta.centerLon, meta.centerLat],
        zoom: 14,
        baseLayer: new maptalks.TileLayer('tile', {
            urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            subdomains: ["a", "b", "c", "d"],
            attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
        })
    });

    const layer = new maptalks.VectorLayer('v').addTo(map);

    const c = map.getCenter();

    // based on function-type v0.18.0 plus support of identity
    // https://www.mapbox.com/mapbox-gl-js/style-spec/#types-function
    const symbolChaser = {
        'markerType': 'ellipse',
        'markerFill': 'rgb(216,115,149)',
        'markerLineWidth': 0,
        'markerLineOpacity': 1,
        'markerWidth': 20,
        'markerHeight': 20,
    };
    const symbolRunner = {
        'markerType': 'ellipse',
        'markerFill': 'lightgreen',
        'markerLineWidth': 0,
        'markerLineOpacity': 1,
        'markerWidth': 20,
        'markerHeight': 20,
    };

    const markers = {};

    const time = meta.minTime;

    console.log(meta);
    console.log(catchTimes);

    for (const [user, userLocations] of Object.entries(locations)) {
        const location = getLocationByTime(userLocations, time);
        markers[user] = new maptalks.Marker(
            new maptalks.Coordinate(location.lon, location.lat),
            {
                symbol: time >= catchTimes[user] ? symbolChaser : symbolRunner,
            }
        ).addTo(layer);
    }


    const redraw = () => {
        const time = timeSlider.value
        for (const [userId, marker] of Object.entries(markers)) {
            const location = getLocationByTime(locations[userId], time);
            marker.setCoordinates(new maptalks.Coordinate(location.lon, location.lat));
            console.log(userId, time, catchTimes[userId], time - catchTimes[userId]);
            marker.setSymbol(time >= catchTimes[userId] ? symbolChaser : symbolRunner);
        }
    }
    timeSlider.addEventListener("input", redraw);

}



main();