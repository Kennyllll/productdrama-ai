"""Logo lock: the video model re-draws the logo every frame and its letters drift into gibberish.
Track the product around the logo and paint the correct logo from the (hi-res) first frame back into every frame.
usage: logo_lock.py <video> <first_frame> <brand_logo_image> <out.mp4>
prints one JSON line: {"status": "locked" | "unchanged" | "no-logo" | "track-lost", ...}"""
import cv2, numpy as np, sys, json, os, subprocess, tempfile
def track(frames, cx0, cy0, cx1, cy1):
    """Homographies frame0 -> frame t for the rigid area around a logo box (frame0 coords)."""
    h, w = frames[0].shape[:2]
    lw, lh = cx1 - cx0, cy1 - cy0
    R = int(max(lw, lh) * 3)
    def roi_mask(f, W):
        m = np.zeros((h, w), np.uint8)
        pts = cv2.perspectiveTransform(np.float32([[[cx0 - R, cy0 - R]], [[cx1 + R, cy0 - R]], [[cx1 + R, cy1 + R]], [[cx0 - R, cy1 + R]]]), W)
        cv2.fillConvexPoly(m, pts.astype(np.int32).reshape(-1, 2), 255)
        lb = cv2.perspectiveTransform(np.float32([[[cx0 - 2, cy0 - 2]], [[cx1 + 2, cy0 - 2]], [[cx1 + 2, cy1 + 2]], [[cx0 - 2, cy1 + 2]]]), W)
        cv2.fillConvexPoly(m, lb.astype(np.int32).reshape(-1, 2), 0)
        m[cv2.cvtColor(f, cv2.COLOR_BGR2HSV)[..., 1] > 70] = 0   # skin / clothes move on their own
        return m
    sift = cv2.SIFT_create(nfeatures=1500, contrastThreshold=0.02)
    gray = lambda f: cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    I = np.eye(3)
    k0, d0 = sift.detectAndCompute(gray(frames[0]), roi_mask(frames[0], I))
    bf = cv2.BFMatcher()
    def match(ka, da, kb, db):
        if da is None or db is None or len(ka) < 8 or len(kb) < 8: return None, 0
        good = [m for m, n in (p for p in bf.knnMatch(da, db, k=2) if len(p) == 2) if m.distance < 0.75 * n.distance]
        if len(good) < 10: return None, len(good)
        A = np.float32([ka[m.queryIdx].pt for m in good]); B = np.float32([kb[m.trainIdx].pt for m in good])
        Hm, inl = cv2.findHomography(A, B, cv2.RANSAC, 2.0)
        return Hm, int(inl.sum()) if inl is not None else 0
    Ws, info = [I.copy()], [(len(k0), 999)]
    pk, pd, W = k0, d0, I.copy()
    for f in frames[1:]:
        k, d = sift.detectAndCompute(gray(f), roi_mask(f, W))
        H0, n0 = match(k0, d0, k, d)
        if H0 is not None and n0 >= 25:
            W = H0
        else:
            Hp, npv = match(pk, pd, k, d)
            if Hp is not None: W = Hp @ W
            n0 = -npv
        Ws.append(W.copy()); info.append((len(k), n0)); pk, pd = k, d
    return Ws, info

TW, TH = 240, 62

def tpl(logo):
    if logo.ndim == 3 and logo.shape[2] == 4:
        a = logo[..., 3:].astype(np.float32) / 255
        logo = (logo[..., :3] * a + 255 * (1 - a)).astype(np.uint8)
    lg = cv2.cvtColor(logo, cv2.COLOR_BGR2GRAY)
    ys, xs = np.nonzero(lg < 128); lg = lg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return lg, lg.shape[1] / lg.shape[0]

def norm(a):
    a = a.astype(np.float32); a -= a.mean(); n = np.linalg.norm(a); return a / n if n > 0 else a

def locate(H, logo):
    """Find the wordmark in the first frame: dark blobs shaped like the logo, deskewed and compared with the brand file."""
    lg, asp = tpl(logo)
    T = norm(255 - cv2.resize(lg, (TW, TH), interpolation=cv2.INTER_AREA))
    g = cv2.cvtColor(H, cv2.COLOR_BGR2GRAY)
    best = (0, None)
    for k in (9, 15, 25, 41):                                  # letter stroke sizes for small .. big logos
        bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        m = (bh > 35).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(3, k // 3) | 1,) * 2))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m)
        for i in range(1, n):
            if st[i, 4] < 60: continue
            ys, xs = np.nonzero(lab[st[i, 1]:st[i, 1] + st[i, 3], st[i, 0]:st[i, 0] + st[i, 2]] == i)
            pts = np.c_[xs + st[i, 0], ys + st[i, 1]].astype(np.float32)
            (cx, cy), (w, h), ang = cv2.minAreaRect(pts)
            if w < h: w, h, ang = h, w, ang + 90
            if not (asp * 0.35 < w / max(h, 1) < asp * 1.6) or h < 8: continue
            # deskew the candidate; perspective along the tube also shears the letters, so try a few shears
            # work on a crop around the blob (fast)
            R = int(max(w, h) * 1.5) + 4
            ox, oy = int(max(0, cx - R)), int(max(0, cy - R))
            gl = g[oy:int(cy + R), ox:int(cx + R)]
            sub = (lab[oy:int(cy + R), ox:int(cx + R)] == i).astype(np.uint8)
            cx, cy = cx - ox, cy - oy
            for sh in np.arange(-0.9, 0.91, 0.15):
                for a2 in (ang, ang + 180):
                    M = cv2.getRotationMatrix2D((cx, cy), a2, 1)
                    M = np.array([[1, sh, -sh * cy], [0, 1, 0]]) @ np.vstack([M, [0, 0, 1]])
                    side = int(max(w, h) * 2)
                    M[:, 2] += [side / 2 - cx, side / 2 - cy]
                    mk = cv2.warpAffine(sub, M, (side, side), flags=cv2.INTER_NEAREST)
                    yy, xx = np.nonzero(mk)
                    if len(xx) < 20: continue
                    x0_, x1_, y0_, y1_ = xx.min(), xx.max() + 1, yy.min(), yy.max() + 1
                    if not (1.2 < (x1_ - x0_) / max(1, y1_ - y0_) < asp * 1.5): continue
                    crop = cv2.warpAffine(gl, M, (side, side), flags=cv2.INTER_AREA, borderValue=255)[y0_:y1_, x0_:x1_]
                    C = norm(255 - cv2.resize(crop, (TW, TH), interpolation=cv2.INTER_AREA))
                    v = float((C * T).sum())
                    if v > best[0]:
                        best = (v, [int(st[i, 0]), int(st[i, 1]), int(st[i, 0] + st[i, 2]), int(st[i, 1] + st[i, 3])])
    return best


def load(p):
    cap = cv2.VideoCapture(p); fr = []
    while True:
        ok, f = cap.read()
        if not ok: return fr, cap.get(cv2.CAP_PROP_FPS)
        fr.append(f)

def letters(H, box):
    """Dark letter alpha of the logo inside box (hi-res coords) + the tilted quad around it."""
    x0, y0, x1, y1 = box
    g = cv2.cvtColor(H[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    k = max(5, (y1 - y0) // 10) | 1                       # a bit wider than a letter stroke
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(np.float32)
    a = np.clip((bh - 30) / 50, 0, 1)                     # thin dark strokes only; big dark parts (basket, seat) drop out
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8))
    bh_, bw_ = a.shape
    inside = [i for i in range(1, n) if st[i, 0] > 0 and st[i, 1] > 0 and st[i, 0] + st[i, 2] < bw_ and st[i, 1] + st[i, 3] < bh_]
    if not inside: raise ValueError("no logo")
    main = max(inside, key=lambda i: st[i, 4])            # the wordmark is the biggest blob fully inside the box
    mx, my, mw, mh = st[main, :4]
    keep = np.zeros_like(a)
    for i in inside:
        x, y, cw, ch = st[i, :4]
        if i == main or (x >= mx and y >= my and x + cw <= mx + mw and y + ch <= my + mh): keep[lab == i] = 1
    a *= cv2.dilate(keep, np.ones((3, 3)))
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))   # drop 1-2 px tube edge lines
    a = cv2.GaussianBlur(cv2.dilate((a > 0.3).astype(np.float32), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))), (0, 0), 0.8)  # include the white + black outline
    ys, xs = np.nonzero(a > 0.3)
    hull = cv2.convexHull(np.ascontiguousarray(np.c_[xs + x0, ys + y0], dtype=np.float32).reshape(-1, 1, 2))
    full = np.zeros(H.shape[:2], np.float32); full[y0:y1, x0:x1] = a
    return full, hull

def run(video, hires, box, out):
    frames, fps = load(video); H = cv2.imread(hires)
    h, w = frames[0].shape[:2]; s = H.shape[1] / w; S = np.diag([1 / s, 1 / s, 1.0])
    A, hull = letters(H, box)
    (cx, cy), (rw, rh), ang = cv2.minAreaRect(hull)
    quad = cv2.boxPoints(((cx, cy), (rw + 10, rh + 10), ang)).astype(np.float32)   # tracking footprint, hi-res coords
    zone_hi = cv2.dilate((A > 0.05).astype(np.uint8), np.ones((13, 13), np.uint8))
    zone_hi = cv2.dilate(cv2.fillConvexPoly(np.zeros_like(zone_hi), cv2.convexHull(np.argwhere(zone_hi)[:, ::-1].astype(np.int32)), 1), np.ones((5, 5), np.uint8)).astype(np.float32)
    Ws, info = track(frames, *[b / s for b in box])
    weak = sum(1 for _, n in info[1:] if abs(n) < 12)
    if weak > len(frames) * 0.1: raise LookupError("track-lost")
    lh = min(rw, rh) / s
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5)
    # 1) refine every frame: align the blurred logo footprint of the first frame to this frame
    Ms = []
    for f, W in zip(frames, Ws):
        M = W @ S
        q = cv2.perspectiveTransform(quad[None], M)[0]
        c = q.mean(0); r = int(max(np.ptp(q[:, 0]), np.ptp(q[:, 1])) * 1.2) + 6
        X0, Y0 = int(max(0, c[0] - r)), int(max(0, c[1] - r)); X1, Y1 = int(min(w, c[0] + r)), int(min(h, c[1] + r))
        src = cv2.warpPerspective(H, M, (w, h), flags=cv2.INTER_AREA)[Y0:Y1, X0:X1]
        k = max(1.5, lh * np.sqrt(abs(np.linalg.det(W[:2, :2]))) * 0.5)
        G = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), k)
        msk = (cv2.cvtColor(f[Y0:Y1, X0:X1], cv2.COLOR_BGR2HSV)[..., 1] < 70).astype(np.uint8) * 255
        R = np.eye(2, 3, dtype=np.float32)
        try: _, R = cv2.findTransformECC(G(src), G(f[Y0:Y1, X0:X1]), R, cv2.MOTION_AFFINE, crit, msk, 1)
        except cv2.error: pass
        T = np.array([[1, 0, X0], [0, 1, Y0], [0, 0, 1.0]])
        Ra = np.vstack([R, [0, 0, 1]]).astype(np.float64)
        Ms.append(T @ Ra @ np.linalg.inv(T) @ M)
    # 2) smooth the logo corners over time (no jitter)
    C = np.array([cv2.perspectiveTransform(quad[None], M)[0] for M in Ms])
    Cs = C.copy()
    for i in range(len(C)):
        lo, hi = max(0, i - 3), min(len(C), i + 4); Cs[i] = C[lo:hi].mean(0)
    hullm = np.zeros(H.shape[:2], np.uint8); cv2.fillConvexPoly(hullm, hull.astype(np.int32).reshape(-1, 2), 1)
    pad = max(3, int(min(rw, rh) * 0.12))
    patch_hi = cv2.dilate(hullm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * pad + 1,) * 2)).astype(np.float32)
    letter_hi = (cv2.dilate((A > 0.2).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)
    Hf = H.astype(np.float32)
    out_frames, sim, occ_frac = [], [], []
    for f, M, c0, c1 in zip(frames, Ms, C, Cs):
        M = cv2.getPerspectiveTransform(c0.astype(np.float32), c1.astype(np.float32)) @ M
        k = np.sqrt(abs(np.linalg.det(M[:2, :2])))           # hi-res px -> video px
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        patch = cv2.warpPerspective(patch_hi, M, (w, h), flags=cv2.INTER_LINEAR)
        zone = (cv2.warpPerspective(zone_hi, M, (w, h)) > 0.5) | (patch > 0.05)
        # in front of the logo (basket, leg, hand): big dark or colourful blobs, not thin letters
        occ = cv2.morphologyEx(((g < 90) | (hsv[..., 1] > 70)).astype(np.uint8), cv2.MORPH_OPEN, np.ones((max(3, int(lh * 1.6)),) * 2, np.uint8))
        occ = cv2.dilate(occ, np.ones((3, 3), np.uint8)) > 0
        bg = cv2.GaussianBlur(cv2.dilate(g, np.ones((7, 7))), (0, 0), 3)
        ink = ((bg - g > 18) | (hsv[..., 1] > 90)) & zone & ~occ
        # garbled bits sticking out of the patch: fill from the tube around them
        ring = ink & (patch < 0.5)
        clean = cv2.inpaint(f, cv2.dilate(ring.astype(np.uint8), np.ones((3, 3), np.uint8)), 3, cv2.INPAINT_TELEA) if ring.any() else f.copy()
        # shading: low-frequency tube colour of this frame vs the first frame, letters left out of both
        src = cv2.warpPerspective(Hf, M, (w, h), flags=cv2.INTER_AREA)
        lw_ = cv2.warpPerspective(letter_hi.astype(np.float32), M, (w, h)) > 0.3
        sig = max(2.0, lh * 0.6)
        def tone(im, wm):
            wm = wm.astype(np.float32)
            return cv2.GaussianBlur(im * wm[..., None], (0, 0), sig) / (cv2.GaussianBlur(wm, (0, 0), sig)[..., None] + 1e-3)
        tube_now = (zone | (cv2.dilate(patch, np.ones((9, 9))) > 0.05)) & ~ink & ~occ & (g > 120)
        tube_src = (cv2.dilate(patch, np.ones((9, 9))) > 0.05) & ~lw_ & (cv2.cvtColor(src.astype(np.uint8), cv2.COLOR_BGR2GRAY) > 120)
        if tube_now.sum() > 30 and tube_src.sum() > 30:
            ratio = np.clip((tone(clean.astype(np.float32), tube_now) + 1) / (tone(src, tube_src) + 1), 0.6, 1.6)
        else:
            ratio = np.ones_like(src)
        src = np.clip(src * ratio, 0, 255)
        # how much the generated logo still looks like the first frame (letters drifting = low)
        lm = (patch > 0.5) & ~occ
        if lm.sum() > 30:
            p_, q_ = cv2.cvtColor(src.astype(np.uint8), cv2.COLOR_BGR2GRAY)[lm].astype(np.float32), g[lm]
            p_ -= p_.mean(); q_ -= q_.mean(); sim.append(float((p_ * q_).sum() / (np.linalg.norm(p_) * np.linalg.norm(q_) + 1e-6)))
        # match the video's softness: the hi-res logo is sharper than the generated frame
        src = cv2.GaussianBlur(src, (0, 0), 0.6)
        a = cv2.GaussianBlur(patch, (0, 0), 1.0) * (~occ)
        occ_frac.append(float((occ & (patch > 0.5)).sum() / max(1, (patch > 0.5).sum())))
        o = clean.astype(np.float32) * (1 - a[..., None]) + src * a[..., None]
        out_frames.append(o.astype(np.uint8))
    return frames, out_frames, Ms, fps, sim, occ_frac


def main():
    video, hires, logo, out = sys.argv[1:5]
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    H = cv2.imread(hires); L = cv2.imread(logo, cv2.IMREAD_UNCHANGED)
    if H is None or L is None:
        print(json.dumps({"status": "error", "error": "cannot read first frame or logo"})); return
    score, b = locate(H, L)
    if b is None or score < 0.45:
        print(json.dumps({"status": "no-logo", "score": round(score, 3)})); return
    pw, ph = int((b[2] - b[0]) * 0.35) + 6, int((b[3] - b[1]) * 0.35) + 6
    box = (max(0, b[0] - pw), max(0, b[1] - ph), min(H.shape[1], b[2] + pw), min(H.shape[0], b[3] + ph))
    try:
        frames, of, Ms, fps, sim, occ = run(video, hires, box, out)
    except ValueError:
        print(json.dumps({"status": "no-logo", "score": round(score, 3)})); return
    except LookupError:
        print(json.dumps({"status": "track-lost", "box": box})); return
    worst = min(sim) if sim else 1.0
    info = {"box": box, "score": round(score, 3), "worst": round(worst, 3), "occluded": round(max(occ) if occ else 0, 2)}
    if worst > 0.85:
        print(json.dumps({"status": "unchanged", **info})); return
    with tempfile.TemporaryDirectory() as d:
        for i, f in enumerate(of): cv2.imwrite(os.path.join(d, f"{i:04d}.png"), f)
        subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-framerate", str(fps), "-i", os.path.join(d, "%04d.png"), "-i", video,
                        "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", out], check=True)
    print(json.dumps({"status": "locked", "frames": len(of), **info}))

if __name__ == "__main__":
    main()
