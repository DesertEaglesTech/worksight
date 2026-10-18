"""Showreel score synthesised from scratch with numpy: no samples. 120 BPM, A minor, 300 s."""
import numpy as np, wave, sys
SR = 44100; BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT; DUR = 300.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def env(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    t = np.arange(n) / SR; hold = n / SR - r if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    return e * (1 - rel)
def lp(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / cutoff) ** 4), len(x))
def hp(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (f / cutoff) ** 2 / np.sqrt(1 + (f / cutoff) ** 4), len(x))
def saw(f, n, phase=0.0):
    t = np.arange(n) / SR; return 2 * ((t * f + phase) % 1) - 1
def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i]
    buf[0][i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    buf[1][i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))
DR = (np.zeros(N), np.zeros(N)); BS = (np.zeros(N), np.zeros(N)); PD = (np.zeros(N), np.zeros(N))
AR = (np.zeros(N), np.zeros(N)); LD = (np.zeros(N), np.zeros(N)); FX = (np.zeros(N), np.zeros(N))
# drums
kn = int(0.45 * SR); kt = np.arange(kn) / SR
KICK = np.sin(2 * np.pi * np.cumsum(45 + 110 * np.exp(-kt * 28)) / SR) * np.exp(-kt * 7.5)
KICK += 0.3 * np.sin(2 * np.pi * np.cumsum(45 + 400 * np.exp(-kt * 90)) / SR) * np.exp(-kt * 60)
sn = int(0.25 * SR); st = np.arange(sn) / SR
SNARE = hp(rng.standard_normal(sn), 1800) * np.exp(-st * 18) * 0.6 + np.sin(2 * np.pi * 185 * st) * np.exp(-st * 25) * 0.5
hn = int(0.06 * SR); HAT = hp(rng.standard_normal(hn), 7000) * np.exp(-np.arange(hn) / SR * 70)
on = int(0.3 * SR); OHAT = hp(rng.standard_normal(on), 6000) * np.exp(-np.arange(on) / SR * 12)
cn = int(0.3 * SR); CLAP = sum(np.roll(hp(rng.standard_normal(cn), 1200) * np.exp(-np.arange(cn) / SR * 22), int(SR * d)) for d in (0, 0.011, 0.023)) * 0.4
# harmony: chord roots and tones (A minor); section B uses a different progression
PROG_A = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]  # Am F C G
PROG_B = [(50, [50, 53, 57]), (57, [57, 60, 64]), (53, [53, 57, 60]), (52, [52, 56, 59])]  # Dm Am F E
def section(bar):
    # (drums level, bass, pad, arp, lead, snare, prog)
    if bar < 8: return dict(k=0, h=0, b=0, p=1, a=0.5, l=0, s=0, prog=PROG_A)
    if bar < 24: return dict(k=1, h=1, b=1, p=1, a=0.7, l=0, s=0, prog=PROG_A)
    if bar < 40: return dict(k=1, h=1, b=1, p=1, a=1, l=0, s=1, prog=PROG_A)
    if bar < 56: return dict(k=1, h=2, b=1, p=1, a=1, l=1, s=1, prog=PROG_A)
    if bar < 64: return dict(k=0, h=0, b=0, p=1, a=0.6, l=0, s=0, prog=PROG_B)
    if bar < 96: return dict(k=1, h=2, b=1, p=1, a=1, l=0.7, s=1, prog=PROG_B)
    if bar < 104: return dict(k=0, h=1, b=0, p=1, a=0.5, l=0, s=0, prog=PROG_A)
    if bar < 136: return dict(k=1, h=2, b=1, p=1, a=1, l=1, s=1, prog=PROG_A)
    return dict(k=1 if bar < 144 else 0, h=1 if bar < 144 else 0, b=1 if bar < 144 else 0, p=1, a=0.6, l=0, s=0, prog=PROG_A)
LEAD = [76, 74, 72, 71, 72, 74, 76, 79, 77, 76, 74, 72, 74, 72, 71, 69]
kick_times = []
for bar in range(int(DUR / BAR)):
    sec = section(bar); t0 = bar * BAR
    root, tones = sec["prog"][bar % 4]
    for b in range(4):
        tb = t0 + b * BEAT
        if sec["k"]: add(DR, tb, KICK, 0.95); kick_times.append(tb)
        if sec["s"] and b in (1, 3): add(DR, tb, SNARE, 0.55, 0.05); add(DR, tb, CLAP, 0.35, -0.05)
        if sec["h"]:
            for e in range(2 if sec["h"] == 1 else 4):
                th = tb + e * BEAT / (2 if sec["h"] == 1 else 4)
                add(DR, th, HAT, 0.16 if e % 2 else 0.1, 0.3)
            add(DR, tb + BEAT / 2, OHAT, 0.08, -0.3)
    if sec["b"]:
        for e in range(8):
            n = int(BEAT / 2 * SR * 0.9); f = midi(root - 12 + (12 if e in (3, 7) else 0))
            sig = lp(saw(f, n) + 0.5 * saw(f * 1.005, n), 900) * env(n, 0.004, 0.12, 0.5, 0.03)
            sig += np.sin(2 * np.pi * f / 2 * np.arange(n) / SR) * env(n, 0.004, 0.2, 0.6, 0.03) * 0.8
            add(BS, t0 + e * BEAT / 2, sig, 0.32)
    if sec["p"]:
        n = int(BAR * SR)
        sig = sum(saw(midi(m) * d, n, rng.random()) for m in tones for d in (0.995, 1.0, 1.006))
        sig = lp(sig, 1400 if sec["k"] else 900) * env(n, 0.6, 1.0, 0.85, 0.5)
        add(PD, t0, sig, 0.045, -0.2); add(PD, t0 + 0.01, sig, 0.045, 0.2)
    if sec["a"]:
        pattern = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[1] + 24, tones[2] + 12, tones[0] + 24, tones[1] + 12, tones[2] + 12]
        for e in range(16):
            n = int(BEAT / 4 * SR * 0.8); f = midi(pattern[e % 8])
            t = np.arange(n) / SR
            sig = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * 2 * t) * 0.3
            sig = lp(sig, 2500 + 1500 * np.sin(bar / 4)) * np.exp(-t * 18)
            add(AR, t0 + e * BEAT / 4, sig, 0.07 * sec["a"], 0.4 if e % 2 else -0.4)
    if sec["l"]:
        for e in range(4):
            note = LEAD[(bar % 4) * 4 + e]; n = int(BEAT * SR * 0.95); t = np.arange(n) / SR
            f = midi(note) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 4, 0, 1))
            ph = np.cumsum(f) / SR
            sig = lp((2 * (ph % 1) - 1) + 0.6 * (2 * ((ph * 1.003) % 1) - 1), 3200) * env(n, 0.01, 0.2, 0.7, 0.08)
            add(LD, t0 + e * BEAT, sig, 0.06 * sec["l"])
# risers and impacts before each drop
for drop_bar in (8, 24, 40, 64, 104):
    td = drop_bar * BAR; n = int(BAR * 2 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    X = np.fft.rfft(noise); f = np.fft.rfftfreq(n, 1 / SR)
    riser = np.fft.irfft(X * np.exp(-((np.log2(f + 1) - 11) ** 2) / 6), n) * (t / t[-1]) ** 2
    add(FX, td - BAR * 2, riser / np.abs(riser).max(), 0.18)
    m = int(1.6 * SR); tm = np.arange(m) / SR
    impact = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-tm * 3)) / SR) * np.exp(-tm * 2.5)
    add(FX, td, impact, 0.6)
# sidechain: duck bass and pad after kicks
duck = np.ones(N)
dn = int(0.3 * SR); shape = 1 - 0.65 * np.exp(-np.arange(dn) / SR * 12)
for kt0 in kick_times:
    i = int(kt0 * SR); j = min(N, i + dn); duck[i:j] = np.minimum(duck[i:j], shape[: j - i])
def reverb(x, seconds=2.4, mix=0.25):
    n = int(seconds * SR); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2); ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x + mix * y
def delay(x, t=BEAT * 0.75, fb=0.35, taps=4):
    y = x.copy(); d = int(t * SR)
    for k in range(1, taps + 1):
        y[d * k:] += x[: N - d * k] * fb ** k
    return y
for ch in (0, 1):
    other = 1 - ch
    wet = reverb(PD[ch] * duck + delay(AR[ch] if ch == 0 else np.roll(AR[ch], int(BEAT / 8 * SR))) * 0.9 + LD[ch] * 0.6, mix=0.35)
    mixd = DR[ch] + BS[ch] * duck + wet + LD[ch] * 0.5 + FX[ch]
    (L if ch == 0 else R)[:] = mixd
# master: fade in/out, soft clip, normalise
t = np.arange(N) / SR
fade = np.clip(t / 2.0, 0, 1) * np.clip((DUR - t) / 6.0, 0, 1)
out = np.stack([L, R]) * fade
out = np.tanh(out * 1.4 / np.abs(out).max()) ; out /= np.abs(out).max() / 0.89
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out.T * 32767).astype("<i2").tobytes())
print("done", out.shape)
