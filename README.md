# 24-hackaburg

## Installation

```bash
python3 -m venv .venv
source .venv/bin/activate
pip3 install -r requirements.txt
```

## Maptalks

* Start as webserver: `python -m http.server 8000`
* [GitHub Pages Deployment](https://sith98.github.io/cacha-animation)

## Log Requests for CaCha App

* The game state changes from the server should be logged. At the moment, we have to reconstruct the game state changes from the gps logs which can lead to errors depending on the rate of the incoming gps locations

* The actual locations, that the hunters get sent every 5 minutes, should be logged by the server.
![Prey Pings](assets/prey_pings.png)
In this case, the hunter got the actual location of the prey in the plot, but in the visualization, it was in the very last part of interpolation, which is why we pinged a older point.

* Maybe a higher rate for the GPS data is useful to calculate totally run distance and especially speeds more precicely
