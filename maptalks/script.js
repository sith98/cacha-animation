const loadJson = (dir) => {
    return Promise.all(["interpol", "team_caught", "team_names", "interesting_timestamps"].map(url => `${dir}/${url}.json`).map(url => {
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
            isConnectionActive: entry.is_connection_active ?? true,
            isInterpolated: entry.is_interpolated,
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
            isConnectionActive: first.isConnectionActive,
        }
    }
    return entry;
}

const getCatchTimeStamp = (isoTime) => {
    if (!isoTime.includes("+")) {
        isoTime += "Z"
    }
    return new Date(isoTime).getTime();
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

    let minRunningTime = Infinity;
    let maxRunningTime = Infinity;

    for (const array of Object.values(locations)) {
        for (const { lon, lat, time, gameState } of array) {
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

            if (gameState === "RUNNING") {
                minRunningTime = Math.min(minRunningTime, time);
            }
            if (gameState === "OVER") {
                maxRunningTime = Math.min(maxRunningTime, time);
            }
        }
    }

    return {
        centerLat: (minLat + maxLat) / 2,
        centerLon: (minLon + maxLon) / 2,
        minTime,
        maxTime,
        minRunningTime,
        maxRunningTime,
    }
}

const getPings = (locations, meta, catchTimes) => {
    const pingInterval = 5 * 60 * 1000;

    const pingTimes = []
    for (let ping = meta.minRunningTime + pingInterval; ping < meta.maxRunningTime; ping += pingInterval) {
        pingTimes.push(ping)
    }

    const pings = []
    for (const ping of pingTimes) {
        const pingLocations = {}
        console.log(locations);
        for (const [user, userLocations] of Object.entries(locations)) {
            const filteredUserLocations = userLocations.filter(l => !l.isInterpolated);
            for (const [index, entry] of filteredUserLocations.entries()) {
                if (entry.time > ping) {
                    const location = filteredUserLocations[index - 1];
                    if (!(user in catchTimes && entry.time >= catchTimes[user])) {
                        pingLocations[user] = location
                    }
                    break;
                }
            }
        }
        pings.push({ time: ping, locations: pingLocations })
    }
    console.log(pings)

    return pings;
}

const wait = ms => new Promise((resolve, reject) => {
    setTimeout(() => resolve(), ms);
})

function waitForEvent(target, type) {
    return new Promise((res) => target.addEventListener(type, res, {
        once: true
    }));
}

function createCanvasRecorder(source, fps = 60) {
    const stream = source.captureStream(fps);
    // const track = stream.getVideoTracks()[0];

    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });

    const dataChunks = [];
    recorder.ondataavailable = (evt) => dataChunks.push(evt.data);

    recorder.start();

    return {
        async finish() {
            recorder.stop();
            stream.getTracks().forEach((track) => track.stop());
            await waitForEvent(recorder, "stop");
            return new Blob(dataChunks);
        },
    };
}

const downloadBlob = (blob, filename) => {
    const a = document.createElement("a");
    a.style = "display: none";
    document.body.appendChild(a);

    const url = URL.createObjectURL(blob);

    a.href = url;
    a.download = filename;
    a.click();
}

const run = async (directory) => {
    document.querySelector("#title").innerHTML = `<strong>${directory}</strong> <small>(press "c" to change)</small>`;
    const [statusUpdate, teamCaught, teamNames, interestingTimestamps] = await loadJson(directory);

    const locations = parseStatusUpdate(statusUpdate)
    const meta = getMeta(locations);
    const catchTimes = getCatchTimes(teamCaught, meta.minTime);
    const pings = getPings(locations, meta, catchTimes);

    const timeSlider = document.querySelector("#time");
    timeSlider.min = meta.minTime;
    timeSlider.max = meta.maxTime;
    timeSlider.value = meta.minTime;

    const timeSteps = []

    for (let t = meta.minTime; t <= meta.maxTime; t += 30_000) {
        timeSteps.push(t);
    }

    const playButton = document.querySelector("#play");

    const map = new maptalks.Map('map', {
        center: [meta.centerLon, meta.centerLat],
        zoom: 16,
        baseLayer: new maptalks.TileLayer('tile', {
            urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            subdomains: ["a", "b", "c", "d"],
            attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
        })
    });

    const mapClickHander = (param) => {
        const coor = param.coordinate;
        console.log("lat", coor.y, "lon", coor.x)
    }
    map.on('click', mapClickHander);

    const tailLayer = new maptalks.VectorLayer("t").addTo(map);
    const layer = new maptalks.VectorLayer("v").addTo(map);
    const pingLayer = new maptalks.VectorLayer("p").addTo(map);


    const overlayRect = new maptalks.Rectangle(
        map.getCenter().add(-5, +5),
        5000000, 5000000,
        {
            symbol: {
                polygonFill: "red"
            },
        }
    );
    const overlayLayer = new maptalks.VectorLayer("o", [overlayRect], {
        opacity: 0.05
    }).addTo(map);

    overlayLayer.hide();


    const c = map.getCenter();
    const markerSize = 20;

    const makeSymbol = (color, size = markerSize) => [
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

    const colorChaser = "#a33636";
    const colorRunner = "#24a924";
    const colorGrey = "#999999";
    const symbolGrey = makeSymbol(colorGrey);
    const symbolPing = makeSymbol(colorRunner);
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

    const pingMarkers = {}
    for (const user of Object.keys(locations)) {
        pingMarkers[user] = new maptalks.Marker(c, {
            symbol: symbolPing
        }).addTo(pingLayer);
    }

    let speedFactor = 120;

    const tailDuration = 5 * 60 * 1000;
    // const tailDuration = 0;
    const tailStepSize = 10 * 1000;
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

    const updateMarker = (marker, userId, time, tailMarker) => {
        const location = getLocationByTime(locations[userId], time);
        marker.setCoordinates(new maptalks.Coordinate(location.lon, location.lat));
        const isChaser = userId in catchTimes && time >= catchTimes[userId];
        const isGrey =
            location.gameState === "TEAM_CREATION_PHASE" && !isChaser ||
            location.gameState === "OVER" && isChaser;
        // const symbol = isGrey ? symbolGrey :
        //     isChaser ? symbolChaser : symbolRunner;
        // marker.setSymbol(symbol);
        const color = isGrey ? colorGrey :
            isChaser ? colorChaser : colorRunner

        if (tailMarker) {
            marker.updateSymbol([{ markerFill: color }, {}])
            if (location.isConnectionActive) {
                marker.show();
            } else {
                marker.hide();
            }
        } else {
            marker.updateSymbol([
                {
                    markerFill: color,
                    markerFillOpacity: location.isConnectionActive ? 1 : 0.3
                },
                {}
            ]);
        }
    }

    const pingMarkerSize = markerSize * 5;
    const pingMarkerTime = 1500;
    const updatePingMarker = (marker, userId, time) => {
        const scaledPingMarkerTime = pingMarkerTime * speedFactor;
        const ping = pings.find(ping => ping.time <= time && time <= ping.time + scaledPingMarkerTime);
        if (ping === undefined || !(userId in ping.locations)) {
            marker.hide();
            return;
        }
        marker.show();
        const factor = (time - ping.time) / scaledPingMarkerTime;
        const size = markerSize * 0.25 * (1 - factor) + pingMarkerSize * factor;
        marker.updateSymbol([{ markerFillOpacity: 0.75 * (1 - factor), markerWidth: size, markerHeight: size }, {}]);
        const location = ping.locations[userId];
        marker.setCoordinates(new maptalks.Coordinate(location.lon, location.lat))
    }

    const log = document.querySelector("#log")
    const timeOverlay = document.querySelector("#timeOutput")
    const redraw = () => {
        timeOverlay.innerHTML = new Date(time).toLocaleTimeString();
        log.innerHTML = time;
        for (const [userId, marker] of Object.entries(markers)) {
            updateMarker(marker, userId, time, false);
            updatePingMarker(pingMarkers[userId], userId, time)
            const roundedTime = Math.floor(time / tailStepSize) * tailStepSize;
            for (const [index, tailMarker] of tailMarkers[userId].entries()) {
                updateMarker(tailMarker, userId, roundedTime - tailStepSize * index, true);
            }
        }
        const slowMo = interestingTimestamps.some(range =>
            range.start <= time && time <= range.end
        ) && enableSlowMo;
        if (slowMo) {
            overlayLayer.show();
        } else {
            overlayLayer.hide();
        }
    }

    let previousTimeStamp = null;
    let paused = true;

    let stopped = false;

    let enableSlowMo = true;
    const frame = timeStamp => {
        if (stopped) {
            return;
        }
        if (previousTimeStamp !== null && !paused) {
            const slowMo = interestingTimestamps.some(range =>
                range.start <= time && time <= range.end
            ) && enableSlowMo;
            const slowMoFactor = slowMo ? 0.1 : 1;
            const ellapsed = timeStamp - previousTimeStamp;
            const newTime = time + ellapsed * speedFactor * slowMoFactor;
            time = Math.min(newTime, meta.maxTime);
            timeSlider.value = time;
            if (time === meta.maxTime) {
                paused = true;
            }
            redraw();
        }
        playButton.innerHTML = paused ? "⏵" : "⏸";
        previousTimeStamp = timeStamp;
        requestAnimationFrame(frame)
    }

    requestAnimationFrame(frame);
    redraw();

    const clickHandler = () => {
        paused = !paused;
    }
    const keyHandler = evt => {
        if (evt.key === " ") {
            evt.preventDefault();
            paused = !paused;
        }
    }
    const sliderHandler = () => {
        time = parseInt(timeSlider.value);
        redraw();
    }

    const recordButton = document.querySelector("#record");
    let recorder = null
    const recordButtonHandle = async () => {
        if (recorder === null) {
            recorder = createCanvasRecorder(document.querySelector("canvas"));
            recordButton.innerHTML = "Save";
        } else {
            const blob = await recorder.finish();
            downloadBlob(blob, "video.webm")
            recorder = null;
            recordButton.innerHTML = "Record";
        }
    }

    const recordKeyHandle = async evt => {
        if (evt.key === "r") {
            recordButtonHandle();
        }
    }

    const speeds = [30, 60, 120, 240];
    const speedButton = document.querySelector("#speed");
    const updateSpeedButton = () => {
        speedButton.innerHTML = `Speed x${speedFactor}`;
    }
    const speedButtonHandler = () => {
        const index = speeds.indexOf(speedFactor);
        speedFactor = speeds[(index + 1) % speeds.length];
        updateSpeedButton();
    }
    updateSpeedButton();

    const slowMoButton = document.querySelector("#slowmo")
    const updateSlowMoButton = () => {
        slowMoButton.innerHTML = enableSlowMo ? "Slow-Mo on" : "Slow-Mo off"
    }
    const slowMoButtonHandler = () => {
        enableSlowMo = !enableSlowMo;
        updateSlowMoButton();
        redraw();
    }
    updateSlowMoButton();

    playButton.addEventListener("click", clickHandler)
    window.addEventListener("keydown", keyHandler)
    timeSlider.addEventListener("input", sliderHandler);
    recordButton.addEventListener("click", recordButtonHandle);
    window.addEventListener("keydown", recordKeyHandle);
    slowMoButton.addEventListener("click", slowMoButtonHandler);
    speedButton.addEventListener("click", speedButtonHandler);

    return () => {
        stopped = true;
        playButton.removeEventListener("click", clickHandler)
        window.removeEventListener("keydown", keyHandler)
        timeSlider.removeEventListener("input", sliderHandler);
        recordButton.removeEventListener("click", recordButtonHandle);
        window.removeEventListener("keydown", recordKeyHandle);
        slowMoButton.removeEventListener("click", slowMoButtonHandler)
        speedButton.removeEventListener("click", speedButtonHandler);
        map.off(mapClickHander);
        map.remove();
    }

}


const main = async () => {
    document.querySelector("#mode").addEventListener("click", evt => {
        const mapContainer = document.querySelector("#map");
        mapContainer.classList.toggle("hd")
    })
    const res = await fetch("games.json");
    const games = await res.json();

    let index = -1;

    let destructor = null;
    let loading = false;

    const switchGame = async () => {
        if (loading) {
            return;
        }
        loading = true;
        if (destructor !== null) {
            destructor();
        }
        index = (index + 1) % games.length;
        const game = games[index];
        destructor = await run(game);

        loading = false;
    }

    window.addEventListener("keydown", async evt => {
        if (evt.key === "c") {
            await switchGame();
        }
    });

    await switchGame();

}

main();