#!/usr/bin/env python3
"""Cuts the engine loops in public/audio/samples/ from the Muted.io Performance Cars pack.

Usage: prepare-engine-audio.py <folder holding the pack's WAV files>   (needs numpy and ffmpeg)
Each layer is a steady stretch of one recording, cut where the waveform repeats best and crossfaded
into itself. Hz is the engine note measured in that stretch, which sets its reference RPM in cars.js.
"""
import os, subprocess, sys
import numpy as np

SR, FADE = 44100, 0.12
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'audio', 'samples')
# set: { layer: (recording, start s, length s, measured Hz) }
SETS = {
    'sports': {'idle': ('002', 3.48, 2.88, 63), 'load': ('003', 3.08, 1.28, 63), 'mid': ('034', 28.16, 0.84, 164), 'high': ('012', 0.5, 2.25, 340)},
    'muscle': {'idle': ('019', 13.24, 1.56, 58), 'load': ('019', 0.0, 0.84, 58), 'mid': ('025', 0.48, 0.72, 90), 'high': ('028', 2.0, 1.25, 333)},
    'normal': {'idle': ('022', 1.92, 1.12, 60), 'load': ('022', 8.44, 2.4, 64), 'mid': ('035', 9.75, 1.0, 145), 'high': ('043', 6.25, 1.0, 307)},
    'truck': {'idle': ('016', 4.04, 1.56, 43), 'load': ('016', 9.08, 1.6, 47), 'mid': ('007', 12.04, 0.76, 76)},
}

def read(pack, rec, start, length):
    path = os.path.join(pack, f'{rec}-performance-cars-mutedio.wav')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(length), '-i', path, '-ac', '1', '-ar', str(SR),
                          '-af', 'highpass=f=28', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(float)

def loop(x):
    fade = min(int(FADE * SR), len(x) // 4)
    head = x[:fade]
    # End the loop where the tail looks most like the head, so the crossfade blends matching waves.
    best, best_end = -2, len(x)
    for end in range(len(x), max(fade * 2, len(x) - int(0.25 * SR)), -8):
        tail = x[end - fade:end]
        score = float(np.dot(head, tail) / (np.linalg.norm(head) * np.linalg.norm(tail) + 1e-9))
        if score > best: best, best_end = score, end
    y = x[:best_end].copy()
    t = np.linspace(0, np.pi / 2, fade)
    start = y[:fade] * np.sin(t) + y[-fade:] * np.cos(t)
    y = np.concatenate([start, y[fade:-fade]])
    return y, best

pack = sys.argv[1]
for name, layers in SETS.items():
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    for layer, (rec, start, length, hz) in layers.items():
        y, match = loop(read(pack, rec, start, length))
        y = y - y.mean()
        rms = np.sqrt((y * y).mean())
        y = y * min(0.12 / rms, 0.95 / np.abs(y).max())
        path = os.path.join(OUT, name, layer + '.flac')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-sample_fmt', 's16', path],
                       input=y.astype(np.float32).tobytes(), check=True)
        seam = abs(y[0] - y[-1]) / (np.abs(np.diff(y)).mean() * 3 + 1e-9)
        q = len(y) // 4
        level = [np.sqrt((y[i * q:(i + 1) * q] ** 2).mean()) for i in range(4)]
        print(f'{name}/{layer}: {rec} {start}s, {len(y)/SR:.2f}s, match {match:.2f}, seam {seam:.2f}, level swing {20*np.log10(max(level)/min(level)):.1f} dB, {os.path.getsize(path)//1024} KB')
