# RUNNER (Playable Web Game)

A 3-lane endless runner with a Subway Surfers feel:
- 1 hit = game over
- Starts slow and ramps up
- 3-lane paved road with dashed lane lines
- Desktop + mobile swipe controls
- SFX: footsteps, jump, slide, pickup, hit

## Run locally (recommended)
1) Install Python (any recent version)
2) In this folder, run:

### Windows (PowerShell)
python -m http.server 8000

### Mac/Linux
python3 -m http.server 8000

3) Open in your browser:
http://localhost:8000

> Tip: Opening index.html directly may block audio in some browsers; the server method is best.

## Controls
- Left / Right (or A/D): change lanes
- Up / W / Space: jump
- Down / S: slide
- Mobile: swipe left/right/up/down (tap also jumps)

## Files
- index.html
- main.js
- assets/ (sprites + sfx)
