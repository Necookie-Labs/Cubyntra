"""
Cubyntra - Kaggle Dataset Color Gamut & Feature Extractor
Necookie Labs (c) 2026

Extracts empirical color profiles, gamut boundaries, and training samples from:
https://www.kaggle.com/datasets/bjoernjostein/rubix-cube (rubix-cube.zip)
"""

import zipfile
import io
import json
import os
from PIL import Image
import numpy as np

ZIP_PATH = r"C:\Users\dheyn\Downloads\rubix-cube.zip"
OUTPUT_JSON = r"src\vision\ml\datasetColorProfile.json"

def rgb_to_lab(r, g, b):
    # sRGB to linear
    def gamma(c):
        c = c / 255.0
        return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    
    rl, gl, bl = gamma(r), gamma(g), gamma(b)
    x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047
    y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / 1.00000
    z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883
    
    def f(t):
        return t ** (1/3) if t > 0.00885645 else 7.787037 * t + 16 / 116
    
    fx, fy, fz = f(x), f(y), f(z)
    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)
    return L, a, b

def rgb_to_hsv(r, g, b):
    r_n, g_n, b_n = r / 255.0, g / 255.0, b / 255.0
    cmax = max(r_n, g_n, b_n)
    cmin = min(r_n, g_n, b_n)
    delta = cmax - cmin
    
    h = 0
    if delta > 0:
        if cmax == r_n:
            h = 60 * (((g_n - b_n) / delta) % 6)
        elif cmax == g_n:
            h = 60 * ((b_n - r_n) / delta + 2)
        else:
            h = 60 * ((r_n - g_n) / delta + 4)
    if h < 0:
        h += 360
        
    s = 0 if cmax == 0 else (delta / cmax) * 100
    v = cmax * 100
    return h, s, v

def process_dataset():
    print(f"Opening dataset from: {ZIP_PATH}")
    if not os.path.exists(ZIP_PATH):
        raise FileNotFoundError(f"Dataset zip file not found at {ZIP_PATH}")
        
    zf = zipfile.ZipFile(ZIP_PATH)
    all_files = [f for f in zf.namelist() if f.startswith('training/training/images/') and f.endswith('.jpg')]
    print(f"Found {len(all_files)} images in dataset. Processing a representative sample of 300 images...")
    
    sample_files = all_files[:300]
    
    color_samples = {
        'white': [],
        'yellow': [],
        'green': [],
        'blue': [],
        'red': [],
        'orange': [],
    }
    
    for idx, fname in enumerate(sample_files):
        data = zf.read(fname)
        im = Image.open(io.BytesIO(data)).convert('RGB')
        arr = np.array(im, dtype=np.float32)
        r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
        brightness = (r + g + b) / 3.0
        
        is_bg = (r < 18) & (g < 18) & (b < 18)
        
        # Segment each color using tight preliminary masks
        is_white = (~is_bg) & (brightness > 185) & (np.abs(r-g) < 22) & (np.abs(g-b) < 22)
        is_blue = (~is_bg) & (b > 130) & (b > r * 1.5) & (b > g * 1.3)
        is_green = (~is_bg) & (g > 95) & (g > r * 1.25) & (g > b * 1.25)
        is_yellow = (~is_bg) & (r > 165) & (g > 145) & (b < 100) & (np.abs(r-g) < 65)
        is_red = (~is_bg) & (r > 155) & (g < 68) & (b < 68)
        is_orange = (~is_bg) & (r > 185) & (g >= 70) & (g <= 130) & (b < 68)
        
        for cname, mask in [('white', is_white), ('yellow', is_yellow), ('green', is_green), 
                            ('blue', is_blue), ('red', is_red), ('orange', is_orange)]:
            if np.any(mask):
                pixels = arr[mask]
                if len(pixels) > 200:
                    selected = pixels[np.random.choice(len(pixels), 200, replace=False)]
                else:
                    selected = pixels
                color_samples[cname].append(selected)
                
        if (idx + 1) % 50 == 0:
            print(f"Processed {idx + 1}/300 images...")
            
    print("Computing empirical color profiles and tolerance radii...")
    profiles = {}
    
    for cname, pixel_chunks in color_samples.items():
        all_px = np.vstack(pixel_chunks)
        mean_rgb = np.mean(all_px, axis=0)
        std_rgb = np.std(all_px, axis=0)
        
        L, a, b = rgb_to_lab(mean_rgb[0], mean_rgb[1], mean_rgb[2])
        h, s, v = rgb_to_hsv(mean_rgb[0], mean_rgb[1], mean_rgb[2])
        
        # Calculate Delta-E from mean for all sampled pixels
        labs = [rgb_to_lab(p[0], p[1], p[2]) for p in all_px[:2000]]
        delta_es = [np.sqrt((pL - L)**2 + (pa - a)**2 + (pb - b)**2) for (pL, pa, pb) in labs]
        p95_delta_e = float(np.percentile(delta_es, 95))
        max_delta_e = float(np.percentile(delta_es, 99))
        
        profiles[cname] = {
            'mean_rgb': [round(float(x), 2) for x in mean_rgb],
            'std_rgb': [round(float(x), 2) for x in std_rgb],
            'lab': {
                'l': round(float(L), 2),
                'a': round(float(a), 2),
                'b': round(float(b), 2),
            },
            'hsv': {
                'h': round(float(h), 1),
                's': round(float(s), 1),
                'v': round(float(v), 1),
            },
            'max_allowed_delta_e': round(max_delta_e, 2),
            'nominal_delta_e': round(p95_delta_e, 2),
            'sample_count': int(len(all_px))
        }
        print(f"  {cname:8s}: LAB=({L:5.1f}, {a:5.1f}, {b:5.1f}) | Max Delta-E Radius={max_delta_e:4.1f} | Samples={len(all_px)}")
        
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(profiles, f, indent=2)
    print(f"Saved empirical color profiles to {OUTPUT_JSON}")

if __name__ == "__main__":
    process_dataset()
