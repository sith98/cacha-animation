const loadJson = () => {
    return Promise.all(["regular_status_update.json", "team_caught.json", "team_names.json"].map(url => {
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
            gameState: entry.game_state,
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
            gameState: first.gameState,
        }
    }
    return entry;
}

const getCatchTimeStamp = (isoTime) => {
    return new Date(isoTime + "Z").getTime();
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
    const [statusUpdate, teamCaught, teamNames] = await loadJson();

    const locations = parseStatusUpdate(statusUpdate)
    const meta = getMeta(locations)
    const catchTimes = getCatchTimes(teamCaught, meta.minTime);

    const timeSlider = document.querySelector("#time");
    timeSlider.min = meta.minTime;
    timeSlider.max = meta.maxTime;

    const playButton = document.querySelector("#play");

    const centerTime = meta.minTime + 0.5 * (meta.maxTime - meta.minTime);

    const map = new maptalks.Map('map', {
        center: [meta.centerLon, meta.centerLat],
        zoom: 16,
        baseLayer: new maptalks.TileLayer('tile', {
            urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            subdomains: ["a", "b", "c", "d"],
            attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
        })
    });

    const tailLayer = new maptalks.VectorLayer("t").addTo(map);
    const layer = new maptalks.VectorLayer("v").addTo(map);

    const c = map.getCenter();

    const makeSymbol = (color, size = 20) => [
        {
            markerType: "ellipse",
            markerFill: color,
            markerLineWidth: 0,
            markerLineOpacity: 1,
            markerWidth: size,
            markerHeight: size,
        },
        {
            textFaceName: "sans-serif",
            textName: "{name}",
            textSize: 14,
            textDy: 24,
        },
    ]

    const colorChaser = "rgb(216,115,149)";
    const colorRunner = "lightgreen";
    const colorGrey = "grey";
    const symbolGrey = makeSymbol(colorGrey);
    const symbolTail = makeSymbol(colorGrey, 5);

    const markers = {};

    let time = meta.minTime;

    console.log(meta);
    console.log(catchTimes);


    for (const [user, userLocations] of Object.entries(locations)) {
        const location = getLocationByTime(userLocations, time);
        markers[user] = new maptalks.Marker(c, {
            properties: {
                name: teamNames[user],
            },
            symbol: symbolGrey
        }).addTo(layer);
    }


    const tailDuration = 5 * 60 * 1000;
    const tailStepSize = 5 * 1000;
    const nTail = Math.floor(tailDuration / tailStepSize);

    const tailMarkers = {}
    for (const user of Object.keys(locations)) {
        tailMarkers[user] = []
        for (let i = 0; i < nTail; i++) {
            const marker = new maptalks.Marker(c.add(i * 0.0002, 0), { symbol: symbolTail }).addTo(tailLayer);

            marker.updateSymbol([{ markerFillOpacity: 1 - (i + 1) / nTail }, {}])
            tailMarkers[user].push(marker);
        }
    }

    const updateMarker = (marker, userId, time) => {
        const location = getLocationByTime(locations[userId], time);
        marker.setCoordinates(new maptalks.Coordinate(location.lon, location.lat));
        const isChaser = userId in catchTimes && time >= catchTimes[userId];
        const isGrey = location.gameState === "TEAM_CREATION_PHASE" && !isChaser || location.gameState === "OVER" && isChaser;
        // const symbol = isGrey ? symbolGrey :
        //     isChaser ? symbolChaser : symbolRunner;
        // marker.setSymbol(symbol);
        const color = isGrey ? colorGrey :
            isChaser ? colorChaser : colorRunner
        marker.updateSymbol([{ markerFill: color }, {}]);
    }

    const redraw = () => {
        for (const [userId, marker] of Object.entries(markers)) {
            updateMarker(marker, userId, time)
            const roundedTime = Math.floor(time / tailStepSize) * tailStepSize;
            for (const [index, tailMarker] of tailMarkers[userId].entries()) {
                updateMarker(tailMarker, userId, roundedTime - tailStepSize * index);
            }
        }
    }
    console.log(markers);

    let previousTimeStamp = null;
    let paused = true;
    const frame = timeStamp => {
        if (previousTimeStamp !== null && !paused) {
            const ellapsed = timeStamp - previousTimeStamp;
            const factor = 120;
            const newTime = time + ellapsed * factor;
            time = Math.min(newTime, meta.maxTime);
            timeSlider.value = time;
            if (time === meta.maxTime) {
                paused = true;
            }
            redraw();
        }
        playButton.innerHTML = paused ? "Play" : "Pause";
        previousTimeStamp = timeStamp;
        requestAnimationFrame(frame)
    }

    requestAnimationFrame(frame);
    redraw();

    playButton.addEventListener("click", () => {
        paused = !paused;
    })
    window.addEventListener("keydown", evt => {
        if (evt.key === " ") {
            paused = !paused;
        }
    })
    timeSlider.addEventListener("input", () => {
        time = parseInt(timeSlider.value);
        redraw();
    });
}



main();