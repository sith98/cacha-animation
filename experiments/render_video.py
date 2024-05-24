# import required packages
import pandas as pd
import plotly.express as px
import plotly.io as pio
import imageio
from tqdm import tqdm


# Plot data to figures
def plot_figures(df, teams, initial_hunter, caught_timestamps, step=5):
    figs = []
    
    # Loop through data
    for t in tqdm(df.index[::step]):
        # Get teams role
        color = []
        for team in teams:
            if team == initial_hunter:
                color.append('hunter')
            elif team in caught_timestamps.keys():
                if caught_timestamps[team] < t:
                    color.append('hunter')
                else:
                    color.append('chased')
            else:
                color.append('chased')
                
        # Data to plot
        data = {'lat': [df[team, 'lat'][t] for team in teams],
                'lon': [df[team, 'lon'][t] for team in teams]}
        df_plot = pd.DataFrame(data)
    
        # Color map
        color_discrete_map = {'hunter': 'red', 'chased': 'green'}
    
        # Create plot
        fig = px.scatter_mapbox(df_plot, lat="lat", lon="lon", color=color, color_discrete_map=color_discrete_map, size=[1] * len(teams), zoom=15, height=720, width=720)
        fig.update_layout(mapbox_style="carto-positron", margin={"r": 0, "t": 0, "l": 0, "b": 0}, mapbox_center_lat=df[teams[0], 'lat'][df.index[0]], mapbox_center_lon=df[teams[0], 'lon'][df.index[0]], showlegend=False)
        figs.append(fig)
        
    # Return figures
    return figs


# Convert figures to video frames
def figs_to_frames(figs):
    frames = []
    
    # Loop through figures
    for fig in tqdm(figs):
        img_bytes = pio.to_image(fig, format="png")
        img = imageio.v2.imread(img_bytes)
        frames.append(img)
        
    # Return frames
    return frames
