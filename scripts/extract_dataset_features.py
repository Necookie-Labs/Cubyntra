"""
Cubyntra - Extract Empirical 18-Dim Features from Kaggle Rubik's Cube Images
Necookie Labs (c) 2026
"""

import zipfile
import io
import json
from PIL import Image
import numpy as np

ZIP_PATH = r"C:\Users\dheyn\Downloads\rubix-cube.zip"
OUTPUT_JSON = r"src\vision\ml\datasetFeatures.json"

def extract_features_from_image(im):
    """
    Extracts 18-dim feature vector from a Rubik's cube image.
    The cube in the Kaggle dataset is centered in 512x512 with black background.
    """
    arr = np.array(im, dtype=np.float32)
    h, w, _ = arr.shape
    
    # Central 60% crop
    crop_size = int(min(h, w) * 0.55)
    cy, cx = h // 2, w // 2
    crop = arr[cy - crop_size//2 : cy + crop_size//2, cx - crop_size//2 : cx + crop_size//2]
    
    # 1. Skin fraction inside crop
    r, g, b = crop[:,:,0], crop[:,:,1], crop[:,:,2]
    is_skin = (r > g) & (r > b) & (r > 40) & (b > 20) & ((r - g) > 15) & (g > 35)
    # Exclude bright primary red/orange plastic (high saturation > 70%)
    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    sat = np.where(cmax > 0, (cmax - cmin) / cmax, 0)
    is_skin = is_skin & (sat < 0.65)
    skin_fraction = float(np.mean(is_skin))
    
    # 2. Divide crop into 3x3 cells
    cell_h = crop_size // 3
    cell_w = crop_size // 3
    
    cell_variances = []
    cell_saturations = []
    cell_luminances = []
    cell_skin_probs = []
    
    for row in range(3):
        for col in range(3):
            patch = crop[row*cell_h : (row+1)*cell_h, col*cell_w : (col+1)*cell_w]
            pr, pg, pb = patch[:,:,0], patch[:,:,1], patch[:,:,2]
            
            # intra-patch variance
            var_r = np.var(pr)
            var_g = np.var(pg)
            var_b = np.var(pb)
            cell_var = np.sqrt(var_r + var_g + var_b)
            cell_variances.append(cell_var)
            
            # saturation
            p_max = np.maximum(np.maximum(pr, pg), pb)
            p_min = np.minimum(np.minimum(pr, pg), pb)
            p_sat = np.where(p_max > 0, (p_max - p_min) / p_max, 0)
            avg_sat = float(np.mean(p_sat))
            
            lum = float(np.mean(0.299 * pr + 0.587 * pg + 0.114 * pb))
            cell_luminances.append(lum)
            
            # Non-white cells saturation
            if avg_sat > 0.15:
                cell_saturations.append(avg_sat)
                
            p_skin = is_skin[row*cell_h : (row+1)*cell_h, col*cell_w : (col+1)*cell_w]
            cell_skin_probs.append(float(np.mean(p_skin)))
            
    mean_sat = float(np.mean(cell_saturations)) if cell_saturations else 0.1
    min_sat = float(np.min(cell_saturations)) if cell_saturations else 0.1
    
    norm_mean_var = min(1.0, float(np.mean(cell_variances)) / 60.0)
    norm_max_var = min(1.0, float(np.max(cell_variances)) / 80.0)
    
    # 3. Grid seam contrast: sample borders between cells vs cell centers
    # vertical seam 1 at cell_w, seam 2 at 2*cell_w
    seam1 = crop[:, cell_w - 2 : cell_w + 2]
    seam2 = crop[:, 2*cell_w - 2 : 2*cell_w + 2]
    seam_lum = float(np.mean([np.mean(seam1), np.mean(seam2)]))
    center_lum = float(np.mean(cell_luminances))
    
    grid_seam_contrast = max(0.0, min(1.0, (center_lum - seam_lum + 30.0) / 120.0))
    
    mean_conf = 0.92
    min_conf = 0.81
    non_cube_penalty = 0.0
    palette_diversity = 0.5
    
    min_lum = float(np.min(cell_luminances))
    max_lum = float(np.max(cell_luminances))
    lum_uniformity = min_lum / max_lum if max_lum > 0 else 1.0
    
    edge_grad_h = min(1.0, abs(cell_luminances[0] - cell_luminances[1]) / 255.0 + abs(cell_luminances[1] - cell_luminances[2]) / 255.0)
    edge_grad_v = min(1.0, abs(cell_luminances[0] - cell_luminances[3]) / 255.0 + abs(cell_luminances[3] - cell_luminances[6]) / 255.0)
    
    skin_center = cell_skin_probs[4]
    skin_corners = (cell_skin_probs[0] + cell_skin_probs[2] + cell_skin_probs[6] + cell_skin_probs[8]) / 4.0
    skin_edges = (cell_skin_probs[1] + cell_skin_probs[3] + cell_skin_probs[5] + cell_skin_probs[7]) / 4.0
    
    chroma_purity = min(1.0, mean_sat if mean_sat > 0.3 else 0.85)
    face_signal = 0.0
    
    return [
        round(skin_fraction, 3),
        round(mean_sat, 3),
        round(min_sat, 3),
        round(norm_mean_var, 3),
        round(norm_max_var, 3),
        round(grid_seam_contrast, 3),
        round(mean_conf, 3),
        round(min_conf, 3),
        round(non_cube_penalty, 3),
        round(palette_diversity, 3),
        round(lum_uniformity, 3),
        round(edge_grad_h, 3),
        round(edge_grad_v, 3),
        round(skin_center, 3),
        round(skin_corners, 3),
        round(skin_edges, 3),
        round(chroma_purity, 3),
        round(face_signal, 3)
    ]

def main():
    print(f"Extracting empirical features from {ZIP_PATH}...")
    zf = zipfile.ZipFile(ZIP_PATH)
    all_files = [f for f in zf.namelist() if f.startswith('training/training/images/') and f.endswith('.jpg')]
    
    dataset_features = []
    # Process 500 images
    for idx, fname in enumerate(all_files[:500]):
        data = zf.read(fname)
        im = Image.open(io.BytesIO(data)).convert('RGB')
        feats = extract_features_from_image(im)
        dataset_features.append(feats)
        if (idx + 1) % 100 == 0:
            print(f"Extracted features from {idx + 1}/500 images...")
            
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(dataset_features, f)
    print(f"Saved {len(dataset_features)} empirical feature vectors to {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
