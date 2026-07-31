#!/usr/bin/env python3
import argparse
import csv
import datetime as dt
import json
import math
import sys
from pathlib import Path

import over15 as ov

GOL_LINHAS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]
HT_LINHAS = [0.5, 1.5, 2.5, 3.5]
ESC_LINHAS = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]
RHO_MIN, RHO_MAX, RHO_STEP = -0.30, 0.05, 0.01
GAMMA = 0.985
PRIOR = 5.0
K_SHRINK = 0.7
K_DISC = 0.2
K_MIN_N = 25
K_RAMP_N = 60


def drift_k(ra, rp, n):
    if n >= K_MIN_N and rp > 0:
        kraw = ra / rp
        return 1.0 + K_SHRINK * (kraw - 1.0) * min(1.0, n / K_RAMP_N)
    return 1.0


def _goals(s):
    try:
        v = float(s)
        return int(v)
    except (TypeError, ValueError):
        return None


def load_rows(data_dir, refresh):
    rows_by_league = {}
    for lg in ov.LEAGUES:
        rows = []
        if lg["key"] == "BRA":
            p = ov.download_csv("https://www.football-data.co.uk/new/BRA.csv", data_dir, "BRA.csv", refresh)
            if not p:
                continue
            with open(p, newline="", encoding="utf-8-sig") as f:
                for r in csv.DictReader(f):
                    if r["Season"] not in ov.BR_SEASONS:
                        continue
                    try:
                        d = ov.parse_date(r["Date"])
                    except ValueError:
                        continue
                    hg, ag = _goals(r.get("HG")), _goals(r.get("AG"))
                    if hg is None or ag is None:
                        continue
                    rows.append({"date": d, "season": r["Season"], "home": r["Home"], "away": r["Away"],
                                 "hg": hg, "ag": ag,
                                 "hhg": None, "hag": None, "hst": None, "ast": None,
                                 "hc": None, "ac": None,
                                 "o_h": ov._float(r.get("AvgCH")), "o_d": ov._float(r.get("AvgCD")),
                                 "o_a": ov._float(r.get("AvgCA")), "o_lines": {},
                                 "over": None, "under": None})
        elif lg.get("espn_only"):
            print(f"  {lg['nome']}: buscando histórico na ESPN (1ª vez demora)...")
            rows = espn_cup_history(data_dir, refresh)
            print(f"  {lg['nome']}: {len(rows)} jogos")
        else:
            for seas in ov.EU_SEASONS:
                p = ov.download_csv(f"https://www.football-data.co.uk/mmz4281/{seas}/{lg['code']}.csv",
                                    data_dir, f"{lg['code']}_{seas}.csv", refresh)
                if not p:
                    continue
                with open(p, newline="", encoding="utf-8-sig") as f:
                    for r in csv.DictReader(f):
                        if not r.get("HomeTeam"):
                            continue
                        try:
                            d = ov.parse_date(r["Date"])
                        except ValueError:
                            continue
                        hg, ag = _goals(r.get("FTHG")), _goals(r.get("FTAG"))
                        if hg is None or ag is None:
                            continue
                        rows.append({"date": d, "season": seas, "home": r["HomeTeam"], "away": r["AwayTeam"],
                                     "hg": hg, "ag": ag,
                                     "hhg": _goals(r.get("HTHG")), "hag": _goals(r.get("HTAG")),
                                     "hst": _goals(r.get("HST")), "ast": _goals(r.get("AST")),
                                     "hc": ov._float(r.get("HC")), "ac": ov._float(r.get("AC")),
                                     "o_h": ov._float(r.get("AvgH")), "o_d": ov._float(r.get("AvgD")),
                                     "o_a": ov._float(r.get("AvgA")),
                                     "o_lines": {
                                         "2.5": (ov._float(r.get("AvgC>2.5")), ov._float(r.get("AvgC<2.5"))),
                                         "3.5": (ov._float(r.get("AvgC>3.5")), ov._float(r.get("AvgC<3.5"))),
                                         "4.5": (ov._float(r.get("AvgC>4.5")), ov._float(r.get("AvgC<4.5"))),
                                         "5.5": (ov._float(r.get("AvgC>5.5")), ov._float(r.get("AvgC<5.5"))),
                                     },
                                     "over": ov._float(r.get("AvgC>2.5")), "under": ov._float(r.get("AvgC<2.5"))})
        rows.sort(key=lambda m: (m["date"], m["season"]))
        rows_by_league[lg["key"]] = rows
    return rows_by_league


def espn_bra_corners(data_dir, refresh):
    cache = data_dir / "espn_corners_bra.json"
    today = dt.date.today()
    cache_date = dt.date.fromtimestamp(cache.stat().st_mtime) if cache.exists() else None
    if cache.exists() and not refresh and cache_date == today:
        return json.loads(cache.read_text())
    year = today.year
    quarters = (("01", "03"), ("04", "06"), ("07", "09"), ("10", "12"))
    chunks = [f"{year}{a}01-{year}{b}30" for a, b in quarters]
    events = {}
    for ch in chunks:
        url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates={ch}"
        try:
            data = json.loads(ov.fetch(url, timeout=30))
        except Exception:
            continue
        for e in data.get("events", []):
            c = e["competitions"][0]
            st = c["status"]["type"]["name"]
            if st not in ("STATUS_FULL_TIME", "STATUS_FINAL"):
                continue
            t = {x["homeAway"]: x["team"]["displayName"] for x in c["competitors"]}
            events[e["id"]] = {"date": e["date"], "home": t.get("home"), "away": t.get("away")}
    for eid in events:
        try:
            s = json.loads(ov.fetch(f"https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event={eid}",
                                    timeout=20))
        except Exception:
            continue
        corners = {}
        for t in (s.get("boxscore") or {}).get("teams", []):
            name = (t.get("team") or {}).get("displayName", "")
            for st in t.get("statistics", []):
                if st.get("name") == "wonCorners":
                    corners[name] = int(st.get("displayValue") or 0)
        if len(corners) == 2:
            ev = events[eid]
            hc = corners.get(ev["home"])
            ac = corners.get(ev["away"])
            if hc is not None and ac is not None:
                ev["hc"], ev["ac"] = hc, ac
        hdr = (s.get("header") or {}).get("competitions", [{}])[0]
        ht = {}
        for c in hdr.get("competitors", []):
            name = (c.get("team") or {}).get("displayName", "")
            ls = c.get("linescores") or []
            if ls and ls[0].get("displayValue") is not None:
                try:
                    ht[name] = int(ls[0]["displayValue"])
                except (TypeError, ValueError):
                    pass
        if len(ht) == 2:
            ev = events[eid]
            hhg = ht.get(ev["home"])
            hag = ht.get(ev["away"])
            if hhg is not None and hag is not None:
                ev["hhg"], ev["hag"] = hhg, hag
    cache.write_text(json.dumps(events, ensure_ascii=False))
    return events


def espn_cup_history(data_dir, refresh):
    cache = data_dir / "espn_cdb_history.json"
    today = dt.date.today()
    cache_date = dt.date.fromtimestamp(cache.stat().st_mtime) if cache.exists() else None
    if cache.exists() and not refresh and cache_date == today:
        raw = json.loads(cache.read_text())
        rows = []
        for r in raw:
            m = dict(r)
            m["date"] = dt.date.fromisoformat(r["date"])
            rows.append(m)
        return rows
    events = {}
    for season in ov.CDB_SEASONS:
        y = int(season)
        d = dt.date(y, 2, 1)
        end = min(dt.date(y, 12, 31), today)
        while d <= end:
            d2 = min(d + dt.timedelta(days=14), end)
            ch = f"{d:%Y%m%d}-{d2:%Y%m%d}"
            url = (f"https://site.api.espn.com/apis/site/v2/sports/soccer/"
                   f"bra.copa_do_brazil/scoreboard?dates={ch}")
            try:
                data = json.loads(ov.fetch(url, timeout=30))
            except Exception:
                d = d2 + dt.timedelta(days=1)
                continue
            for e in data.get("events", []):
                c = e["competitions"][0]
                if c["status"]["type"]["name"] not in ("STATUS_FULL_TIME", "STATUS_FINAL"):
                    continue
                ent = {"date": e["date"], "names": {}, "ids": {}}
                for x in c["competitors"]:
                    role = x.get("homeAway")
                    if role not in ("home", "away"):
                        continue
                    nm = (x.get("team") or {}).get("displayName", "")
                    tid = (x.get("team") or {}).get("id")
                    ent["names"][role] = nm
                    ent["ids"][role] = tid
                if "home" not in ent["names"] or "away" not in ent["names"]:
                    continue
                events[e["id"]] = ent
            d = d2 + dt.timedelta(days=1)
    rows = []
    for eid, ev in events.items():
        try:
            s = json.loads(ov.fetch(f"https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event={eid}",
                                    timeout=20))
        except Exception:
            continue
        hdr = (s.get("header") or {}).get("competitions", [{}])[0]
        info = {}
        for c in hdr.get("competitors", []):
            tid = (c.get("team") or {}).get("id")
            if not tid:
                continue
            try:
                score = int(c.get("score"))
            except (TypeError, ValueError):
                continue
            ls = c.get("linescores") or []
            ht = None
            if ls and ls[0].get("displayValue") is not None:
                try:
                    ht = int(ls[0]["displayValue"])
                except (TypeError, ValueError):
                    pass
            info[tid] = {"score": score, "ht": ht}
        hid, aid = ev["ids"].get("home"), ev["ids"].get("away")
        if not hid or not aid or hid not in info or aid not in info:
            continue
        try:
            d = dt.date.fromisoformat(ev["date"][:10])
        except ValueError:
            continue
        rows.append({
            "date": d.isoformat(), "season": str(d.year),
            "home": ev["names"]["home"], "away": ev["names"]["away"],
            "hg": info[hid]["score"], "ag": info[aid]["score"],
            "hhg": info[hid]["ht"], "hag": info[aid]["ht"],
            "hst": None, "ast": None, "hc": None, "ac": None,
            "o_h": None, "o_d": None, "o_a": None, "o_lines": {},
            "over": None, "under": None,
        })
    rows.sort(key=lambda m: (m["date"], m["home"]))
    cache.write_text(json.dumps(rows, ensure_ascii=False))
    out = []
    for r in rows:
        m = dict(r)
        m["date"] = dt.date.fromisoformat(r["date"])
        out.append(m)
    return out


def merge_bra_corners(rows, events):
    hist_names = set()
    for m in rows:
        hist_names.add(m["home"])
        hist_names.add(m["away"])
    norm_names = sorted({ov.norm(h) for h in hist_names})
    name_by_norm = {ov.norm(h): h for h in hist_names}
    by_name = {}
    for ev in events.values():
        if "hc" not in ev and "hhg" not in ev:
            continue
        try:
            d = dt.datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).date()
        except ValueError:
            continue
        hh = ov.map_team(ev["home"] or "", hist_names, norm_names, name_by_norm)
        aa = ov.map_team(ev["away"] or "", hist_names, norm_names, name_by_norm)
        if not hh or not aa:
            continue
        by_name.setdefault((ov.norm(hh), ov.norm(aa)), []).append(
            (d, ev.get("hc"), ev.get("ac"), ev.get("hhg"), ev.get("hag")))
    cur_season = str(dt.date.today().year)
    n = 0
    for m in rows:
        if m["season"] != cur_season:
            continue
        cands = by_name.get((ov.norm(m["home"]), ov.norm(m["away"])))
        if not cands:
            continue
        for d, hc, ac, hhg, hag in cands:
            if abs((m["date"] - d).days) <= 1:
                if hc is not None and ac is not None:
                    m["hc"], m["ac"] = hc, ac
                if hhg is not None and hag is not None:
                    m["hhg"], m["hag"] = hhg, hag
                n += 1
                break
    return n


class State:
    def __init__(self):
        self.g_h = self.g_a = 0.0
        self.g_w = self.g_n = 0
        self.hh_h = self.hh_a = 0.0
        self.hh_w = self.hh_n = 0
        self.c_h = self.c_a = 0.0
        self.c_w = self.c_n = 0
        self.s_h = self.s_a = 0.0
        self.s_w = self.s_n = 0
        self.teams = {}

    def _bk(self, team, role, kind):
        t = self.teams.get(team)
        if t is None:
            t = self.teams[team] = {}
        key = f"{kind}_{role}"
        b = t.get(key)
        if b is None:
            b = t[key] = {"n": 0, "s": 0.0, "c": 0.0, "w": 0.0}
        return b

    def advance(self, m):
        has_c = m["hc"] is not None and m["ac"] is not None
        has_ht = m["hhg"] is not None and m["hag"] is not None
        has_sot = m["hst"] is not None and m["ast"] is not None
        self.g_h *= GAMMA
        self.g_a *= GAMMA
        self.g_w *= GAMMA
        self.g_h += m["hg"]
        self.g_a += m["ag"]
        self.g_w += 1
        self.g_n += 1
        if has_sot:
            self.s_h *= GAMMA
            self.s_a *= GAMMA
            self.s_w *= GAMMA
            self.s_h += m["hst"]
            self.s_a += m["ast"]
            self.s_w += 1
            self.s_n += 1
        if has_ht:
            self.hh_h *= GAMMA
            self.hh_a *= GAMMA
            self.hh_w *= GAMMA
            self.hh_h += m["hhg"]
            self.hh_a += m["hag"]
            self.hh_w += 1
            self.hh_n += 1
        if has_c:
            self.c_h *= GAMMA
            self.c_a *= GAMMA
            self.c_w *= GAMMA
            self.c_h += m["hc"]
            self.c_a += m["ac"]
            self.c_w += 1
            self.c_n += 1
        for role, name, gs, gc, hs, hc_, ss, sc_ in (
                ("home", m["home"], m["hg"], m["ag"], m["hhg"], m["hag"], m["hst"], m["ast"]),
                ("away", m["away"], m["ag"], m["hg"], m["hag"], m["hhg"], m["ast"], m["hst"])):
            b = self._bk(name, role, "g")
            b["s"] *= GAMMA
            b["c"] *= GAMMA
            b["w"] *= GAMMA
            b["s"] += gs
            b["c"] += gc
            b["w"] += 1
            b["n"] += 1
            if has_ht:
                hb = self._bk(name, role, "h")
                hb["s"] *= GAMMA
                hb["c"] *= GAMMA
                hb["w"] *= GAMMA
                hb["s"] += hs
                hb["c"] += hc_
                hb["w"] += 1
                hb["n"] += 1
            if has_sot:
                sb = self._bk(name, role, "s")
                sb["s"] *= GAMMA
                sb["c"] *= GAMMA
                sb["w"] *= GAMMA
                sb["s"] += ss
                sb["c"] += sc_
                sb["w"] += 1
                sb["n"] += 1
            if has_c:
                cb = self._bk(name, role, "c")
                cb["s"] *= GAMMA
                cb["c"] *= GAMMA
                cb["w"] *= GAMMA
                if role == "home":
                    cb["s"] += m["hc"]
                    cb["c"] += m["ac"]
                else:
                    cb["s"] += m["ac"]
                    cb["c"] += m["hc"]
                cb["w"] += 1
                cb["n"] += 1

    def _stats(self, team, role, kind, base_s, base_c, min_matches):
        b = self._bk(team, role, kind)
        if b["n"] < min_matches:
            return None
        if PRIOR > 0:
            return ((b["s"] + PRIOR * base_s) / (b["w"] + PRIOR),
                    (b["c"] + PRIOR * base_c) / (b["w"] + PRIOR))
        return b["s"] / b["w"], b["c"] / b["w"]

    def lambdas(self, home, away, min_matches=ov.MIN_MATCHES):
        if self.g_n == 0:
            return None
        bg_h = self.g_h / self.g_w
        bg_a = self.g_a / self.g_w
        lh = self._stats(home, "home", "g", bg_h, bg_a, min_matches)
        la = self._stats(away, "away", "g", bg_a, bg_h, min_matches)
        gh = self._stats(home, "away", "g", bg_a, bg_h, min_matches)
        ga = self._stats(away, "home", "g", bg_h, bg_a, min_matches)
        full = all(x is not None for x in (lh, la, gh, ga))
        if not full:
            lh = lh or (bg_h, bg_a)
            la = la or (bg_a, bg_h)
            gh = gh or (bg_a, bg_h)
            ga = ga or (bg_h, bg_a)
        lam_h = lh[0] * ga[1] / bg_a if bg_a else 0.0
        lam_a = la[0] * gh[1] / bg_h if bg_h else 0.0
        lam_c = None
        if self.c_n > 0:
            bc_h = self.c_h / self.c_w
            bc_a = self.c_a / self.c_w
            ch = self._stats(home, "home", "c", bc_h, bc_a, min_matches)
            ca = self._stats(away, "away", "c", bc_a, bc_h, min_matches)
            cgh = self._stats(home, "away", "c", bc_a, bc_h, min_matches)
            cga = self._stats(away, "home", "c", bc_h, bc_a, min_matches)
            if not all(x is not None for x in (ch, ca, cgh, cga)):
                ch = ch or (bc_h, bc_a)
                ca = ca or (bc_a, bc_h)
                cgh = cgh or (bc_a, bc_h)
                cga = cga or (bc_h, bc_a)
            lam_c = (ch[0] * cga[1] / bc_a if bc_a else 0.0,
                     ca[0] * cgh[1] / bc_h if bc_h else 0.0)
        lam_ht = None
        if self.hh_n > 0:
            bh_h = self.hh_h / self.hh_w
            bh_a = self.hh_a / self.hh_w
            hh = self._stats(home, "home", "h", bh_h, bh_a, min_matches)
            ha = self._stats(away, "away", "h", bh_a, bh_h, min_matches)
            hgh = self._stats(home, "away", "h", bh_a, bh_h, min_matches)
            hga = self._stats(away, "home", "h", bh_h, bh_a, min_matches)
            if not all(x is not None for x in (hh, ha, hgh, hga)):
                hh = hh or (bh_h, bh_a)
                ha = ha or (bh_a, bh_h)
                hgh = hgh or (bh_a, bh_h)
                hga = hga or (bh_h, bh_a)
            lam_ht = (hh[0] * hga[1] / bh_a if bh_a else 0.0,
                      ha[0] * hgh[1] / bh_h if bh_h else 0.0)
        lam_s = None
        if self.s_n > 0:
            bs_h = self.s_h / self.s_w
            bs_a = self.s_a / self.s_w
            sh = self._stats(home, "home", "s", bs_h, bs_a, min_matches)
            sa = self._stats(away, "away", "s", bs_a, bs_h, min_matches)
            sgh = self._stats(home, "away", "s", bs_a, bs_h, min_matches)
            sga = self._stats(away, "home", "s", bs_h, bs_a, min_matches)
            if not all(x is not None for x in (sh, sa, sgh, sga)):
                sh = sh or (bs_h, bs_a)
                sa = sa or (bs_a, bs_h)
                sgh = sgh or (bs_a, bs_h)
                sga = sga or (bs_h, bs_a)
            lam_sot = (sh[0] * sga[1] / bs_a if bs_a else 0.0,
                       sa[0] * sgh[1] / bs_h if bs_h else 0.0)
            conv_h = self.g_h / self.g_w / (self.s_h / self.s_w) if self.s_w else 0.0
            conv_a = self.g_a / self.g_w / (self.s_a / self.s_w) if self.s_w else 0.0
            lam_s = (lam_sot[0] * conv_h, lam_sot[1] * conv_a)
        return {"lam_h": lam_h, "lam_a": lam_a, "lam_c": lam_c, "lam_ht": lam_ht,
                "lam_s": lam_s, "full": full}


def pois(k, lam):
    return math.exp(-lam) * lam ** k / math.factorial(k)


def log_pois(k, lam):
    if lam <= 0:
        return -1e9 if k == 0 else -1e12
    return -lam + k * math.log(lam) - math.lgamma(k + 1)


def cdf_pois(k, lam):
    e = math.exp(-lam)
    s = 0.0
    f = 1.0
    for i in range(k + 1):
        if i > 0:
            f *= lam / i
        s += e * f
    return s


def tau(i, j, lh, la, rho):
    if i == 0 and j == 0:
        return 1.0 - lh * la * rho
    if i == 0 and j == 1:
        return 1.0 + lh * rho
    if i == 1 and j == 0:
        return 1.0 + la * rho
    if i == 1 and j == 1:
        return 1.0 - rho
    return 1.0


def x12(lh, la, rho):
    pi = [pois(i, lh) for i in range(13)]
    pj = [pois(j, la) for j in range(13)]
    total = home = draw = away = 0.0
    for i in range(13):
        for j in range(13):
            w = pi[i] * pj[j] * tau(i, j, lh, la, rho)
            total += w
            if i > j:
                home += w
            elif i == j:
                draw += w
            else:
                away += w
    return home / total, draw / total, away / total


def joint_metrics(lh, la, rho):
    pi = [pois(i, lh) for i in range(13)]
    pj = [pois(j, la) for j in range(13)]
    grid = [[pi[i] * pj[j] * tau(i, j, lh, la, rho) for j in range(13)] for i in range(13)]
    total = home = draw = away = 0.0
    for i in range(13):
        for j in range(13):
            w = grid[i][j]
            total += w
            if i > j:
                home += w
            elif i == j:
                draw += w
            else:
                away += w
    over = []
    for l in GOL_LINHAS:
        k = int(l)
        o = 0.0
        for i in range(13):
            for j in range(13):
                if i + j >= k + 1:
                    o += grid[i][j]
        over.append(o / total)
    return {"ph": home / total, "pd": draw / total, "pa": away / total,
            "gols_over": over, "gols_under": [1.0 - p for p in over]}


def estimate_rho(rows, tune_season):
    pairs = []
    state = State()
    tune_start = None
    for m in rows:
        if m["season"] == tune_season:
            tune_start = m["date"]
            break
    if tune_start is None:
        return 0.0
    by_day = {}
    for m in rows:
        by_day.setdefault(m["date"], []).append(m)
    for d in sorted(by_day):
        ms = by_day[d]
        if d >= tune_start:
            for m in ms:
                r = state.lambdas(m["home"], m["away"])
                if r and m["season"] == tune_season:
                    pairs.append((r["lam_h"], r["lam_a"], m["hg"], m["ag"]))
        for m in ms:
            state.advance(m)
    if len(pairs) < 200:
        return 0.0
    best, best_ll = 0.0, -1e18
    rho = RHO_MIN
    while rho <= RHO_MAX:
        ll = 0.0
        for lh, la, i, j in pairs:
            w = max(tau(i, j, lh, la, rho), 1e-8)
            ll += log_pois(i, lh) + log_pois(j, la) + math.log(w)
        if ll > best_ll:
            best_ll, best = ll, rho
        rho += RHO_STEP
    return best


def line_probs(lam_c, lam_ht, lines_c):
    e = {"over": [], "under": []}
    if lam_c is not None:
        lamc = lam_c[0] + lam_c[1]
        for l in lines_c:
            k = int(l)
            p_over = 1.0 - cdf_pois(k, lamc)
            e["over"].append(p_over)
            e["under"].append(1.0 - p_over)
    h = {"over": [], "under": []}
    if lam_ht is not None:
        lamt = lam_ht[0] + lam_ht[1]
        for l in HT_LINHAS:
            k = int(l)
            p_over = 1.0 - cdf_pois(k, lamt)
            h["over"].append(p_over)
            h["under"].append(1.0 - p_over)
    return e, h


def league_drift(rows, w_sot):
    run = {}
    prev = None
    last_s = None
    state = State()
    by_day = {}
    for m in rows:
        by_day.setdefault(m["date"], []).append(m)
    for d in sorted(by_day):
        ms = by_day[d]
        for m in ms:
            if last_s is not None and m["season"] != last_s:
                p = run.get(last_s, (0.0, 0.0, 0))
                prev = (p[0] * K_DISC, p[1] * K_DISC, p[2] * K_DISC)
            last_s = m["season"]
            r = state.lambdas(m["home"], m["away"])
            if r is not None:
                lam_h, lam_a = r["lam_h"], r["lam_a"]
                if w_sot > 0 and r["lam_s"] is not None:
                    lam_h = w_sot * r["lam_s"][0] + (1 - w_sot) * lam_h
                    lam_a = w_sot * r["lam_s"][1] + (1 - w_sot) * lam_a
                ra, rp, n = run.get(m["season"], (0.0, 0.0, 0))
                run[m["season"]] = (ra + m["hg"] + m["ag"], rp + lam_h + lam_a, n + 1)
        for m in ms:
            state.advance(m)
    return run


def backtest_all(rows, tune_season, rho, w_sot=0.0):
    out = []
    state = State()
    tune_start = None
    for m in rows:
        if m["season"] == tune_season:
            tune_start = m["date"]
            break
    if tune_start is None:
        return out
    by_day = {}
    for m in rows:
        by_day.setdefault(m["date"], []).append(m)
    run = {}
    prev = None
    last_s = None
    for d in sorted(by_day):
        ms = by_day[d]
        if d >= tune_start:
            for m in ms:
                if last_s is not None and m["season"] != last_s:
                    p = run.get(last_s, (0.0, 0.0, 0))
                    prev = (p[0] * K_DISC, p[1] * K_DISC, p[2] * K_DISC)
                last_s = m["season"]
                r = state.lambdas(m["home"], m["away"])
                if r is None:
                    continue
                lam_h, lam_a = r["lam_h"], r["lam_a"]
                if w_sot > 0 and r["lam_s"] is not None:
                    lam_h = w_sot * r["lam_s"][0] + (1 - w_sot) * lam_h
                    lam_a = w_sot * r["lam_s"][1] + (1 - w_sot) * lam_a
                raw_tot = lam_h + lam_a
                s = m["season"]
                seed = prev if prev else (0.0, 0.0, 0)
                ra, rp, n = run.get(s, seed)
                k = drift_k(ra, rp, n)
                lam_h, lam_a = lam_h * k, lam_a * k
                rec = {"season": m["season"], "date": d, "hit": m["hg"] + m["ag"] > 1.5,
                       "hg": m["hg"], "ag": m["ag"],
                       "hhg": m["hhg"], "hag": m["hag"], "hc": m["hc"], "ac": m["ac"],
                       "o_h": m["o_h"], "o_d": m["o_d"], "o_a": m["o_a"], "o_lines": m["o_lines"],
                       "lam": lam_h + lam_a, "lamc": r["lam_c"], "lam_ht": r["lam_ht"]}
                jm = joint_metrics(lam_h, lam_a, rho)
                rec["ph"], rec["pd"], rec["pa"] = jm["ph"], jm["pd"], jm["pa"]
                rec["gols"] = {"over": jm["gols_over"], "under": jm["gols_under"]}
                e, h = line_probs(r["lam_c"], r["lam_ht"], ESC_LINHAS)
                rec["esc"] = e
                rec["ht"] = h
                out.append(rec)
                run[s] = (ra + m["hg"] + m["ag"], rp + raw_tot, n + 1)
        for m in ms:
            state.advance(m)
    return out


def build_valid(rows_all, rho_map, w_sot):
    valid = {k: [] for k in ("x12", "gols_over", "gols_under", "ht_over", "ht_under",
                             "esc_over", "esc_under")}
    base_tot = {"n": 0, "h": 0}
    for lg in ov.LEAGUES:
        rows = rows_all.get(lg["key"])
        if not rows:
            continue
        tune_season = ov.TUNE_SEASON.get(lg["key"], "2425")
        items = backtest_all(rows, tune_season, rho_map.get(lg["key"], 0.0), w_sot)
        for it in items:
            if it["season"] == tune_season:
                continue
            for mkt in valid:
                if mkt == "x12":
                    valid[mkt].append(it)
                elif mkt in ("gols_over", "gols_under"):
                    valid[mkt].append(it)
                elif mkt in ("ht_over", "ht_under") and it["lam_ht"] is not None:
                    valid[mkt].append(it)
                elif mkt in ("esc_over", "esc_under") and it["lamc"] is not None:
                    valid[mkt].append(it)
            base_tot["n"] += 1
            base_tot["h"] += 1 if it["hit"] else 0
    return valid, base_tot


def brier_x12(items):
    tot = 0.0
    for x in items:
        p = [x["ph"], x["pd"], x["pa"]]
        if x["hg"] > x["ag"]:
            k = 0
        elif x["hg"] == x["ag"]:
            k = 1
        else:
            k = 2
        tot += (1 - p[k]) ** 2 + sum(p[j] ** 2 for j in range(3) if j != k)
    return tot / len(items) if items else 1.0


def validacao(items, market, min_n=30):
    res = {}
    if market == "x12":
        for t in (0.60, 0.65, 0.70, 0.75):
            sel = [x for x in items if max(x["ph"], x["pd"], x["pa"]) >= t]
            if len(sel) < min_n:
                continue
            ok = sum(1 for x in sel
                     if (x["ph"] >= x["pd"] and x["ph"] >= x["pa"] and x["hg"] > x["ag"])
                     or (x["pd"] >= x["ph"] and x["pd"] >= x["pa"] and x["hg"] == x["ag"])
                     or (x["pa"] >= x["ph"] and x["pa"] >= x["pd"] and x["hg"] < x["ag"]))
            res[str(t)] = {"n": len(sel), "taxa": ok / len(sel)}
        return res
    lines, thr, prefix = GOL_LINHAS, 0.85, "gols"
    if market.startswith("esc"):
        lines, thr, prefix = ESC_LINHAS, 0.70, "esc"
    elif market.startswith("ht"):
        lines, thr, prefix = HT_LINHAS, 0.80, "ht"
    side = "over" if market.endswith("over") else "under"
    for li, l in enumerate(lines):
        sel = [x for x in items if x[prefix][side][li] >= thr]
        if prefix == "esc":
            sel = [x for x in sel if x["hc"] is not None and x["ac"] is not None]
        elif prefix == "ht":
            sel = [x for x in sel if x["hhg"] is not None and x["hag"] is not None]
        if len(sel) < min_n:
            continue
        if prefix == "gols":
            total = lambda x: x["hg"] + x["ag"]
        elif prefix == "esc":
            total = lambda x: x["hc"] + x["ac"]
        else:
            total = lambda x: x["hhg"] + x["hag"]
        if side == "over":
            ok = sum(1 for x in sel if total(x) >= int(l) + 1)
        else:
            ok = sum(1 for x in sel if total(x) <= int(l))
        res[f"{l:g}"] = {"n": len(sel), "taxa": ok / len(sel)}
    return res


def calibrar(items, market):
    res = {}
    if market == "x12":
        sel = [x for x in items if x["o_h"] and x["o_d"] and x["o_a"]]
        if len(sel) < 200:
            return res

        def pred(w, x):
            pm = [1.0 / x["o_h"], 1.0 / x["o_d"], 1.0 / x["o_a"]]
            s = sum(pm)
            pm = [p / s for p in pm]
            po = [x["ph"], x["pd"], x["pa"]]
            return [w * a + (1 - w) * b for a, b in zip(pm, po)]

        def outcome(x):
            if x["hg"] > x["ag"]:
                return 0
            if x["hg"] == x["ag"]:
                return 1
            return 2

        def brier(w):
            tot = 0.0
            for x in sel:
                p = pred(w, x)
                k = outcome(x)
                tot += (1 - p[k]) ** 2 + sum(p[j] ** 2 for j in range(3) if j != k)
            return tot / len(sel)

        best_w, best_b = 0.0, 1e18
        w = 0.0
        while w <= 1.001:
            b = brier(w)
            if b < best_b:
                best_b, best_w = b, w
            w += 0.05
        sel75 = [x for x in sel if max(pred(best_w, x)) >= 0.75]
        ok = sum(1 for x in sel75 if outcome(x) == pred(best_w, x).index(max(pred(best_w, x))))
        res = {"w": round(best_w, 2), "taxa": ok / len(sel75), "n": len(sel75), "brier": best_b}
        return res

    if market.startswith("gols"):
        for li, l in enumerate(GOL_LINHAS):
            kl = f"{l:g}"
            if kl not in ("2.5", "3.5", "4.5", "5.5"):
                continue
            sel = [x for x in items if x["o_lines"].get(kl)
                   and x["o_lines"][kl][0] and x["o_lines"][kl][1]]
            if len(sel) < 200:
                continue

            def pred(w, x):
                ov_, un = x["o_lines"][kl]
                po = (1.0 / ov_) / (1.0 / ov_ + 1.0 / un)
                return w * po + (1 - w) * x["gols"]["over"][li]

            def brier(w):
                tot = 0.0
                for x in sel:
                    hit = 1.0 if x["hg"] + x["ag"] >= int(l) + 1 else 0.0
                    tot += (hit - pred(w, x)) ** 2
                return tot / len(sel)

            best_w, best_b = 0.0, 1e18
            w = 0.0
            while w <= 1.001:
                b = brier(w)
                if b < best_b:
                    best_b, best_w = b, w
                w += 0.05
            if market.endswith("over"):
                sel_pick = [x for x in sel if pred(best_w, x) >= 0.85]
                ok = sum(1 for x in sel_pick if x["hg"] + x["ag"] >= int(l) + 1)
            else:
                sel_pick = [x for x in sel if 1 - pred(best_w, x) >= 0.85]
                ok = sum(1 for x in sel_pick if x["hg"] + x["ag"] <= int(l))
            res[kl] = {"w": round(best_w, 2), "taxa": ok / len(sel_pick) if sel_pick else 0.0,
                       "n": len(sel_pick)}
    return res


def fmt_br(iso):
    try:
        u = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso
    return (u + dt.timedelta(hours=-3)).strftime("%d/%m %H:%M")


def main():
    ap = argparse.ArgumentParser(description="Análise 1X2, Over/Under gols e escanteios")
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--no-espn-corners", action="store_true")
    ap.add_argument("--out", default="front/analise.json")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    data_dir.mkdir(exist_ok=True)

    print("== Carregando histórico ==")
    rows_all = load_rows(data_dir, args.refresh)
    if "BRA" in rows_all and not args.no_espn_corners:
        print("  Buscando escanteios do Brasileirão na ESPN (1ª vez demora)...")
        evs = espn_bra_corners(data_dir, args.refresh)
        n = merge_bra_corners(rows_all["BRA"], evs)
        print(f"  {n} jogos do Brasileirão 2026 com escanteios")

    print("\n== Backtest walk-forward ==")
    rho_map = {}
    for lg in ov.LEAGUES:
        rows = rows_all.get(lg["key"])
        if not rows:
            continue
        rho_map[lg["key"]] = estimate_rho(rows, ov.TUNE_SEASON.get(lg["key"], "2425"))
    if "BRA" in rho_map:
        print(f"  Brasileirão Série A     rho={rho_map['BRA']:+.2f}")

    print("  Otimizando peso SOT (chutes no alvo) por Brier...")
    best_w, best_b = 0.0, 1e18
    w = 0.0
    while w <= 1.001:
        valid_w, _ = build_valid(rows_all, rho_map, w)
        b = brier_x12(valid_w["x12"])
        if b < best_b:
            best_b, best_w = b, w
        w += 0.1
    print(f"  w_sot={best_w:.1f} (Brier 1X2: {best_b:.4f})")
    valid0, _ = build_valid(rows_all, rho_map, 0.0)
    valid, base_tot = build_valid(rows_all, rho_map, best_w)

    print(f"\n  Base over 1.5 (validação): {base_tot['h']/base_tot['n']:.1%} (n={base_tot['n']})")
    print("\n== VALIDAÇÃO fora de amostra ==")
    v12 = validacao(valid["x12"], "x12")
    v12_0 = validacao(valid0["x12"], "x12")
    if "0.75" in v12 and "0.75" in v12_0:
        print(f"  1X2 @P>=0.75: gols={v12_0['0.75']['taxa']:.1%} (n={v12_0['0.75']['n']}) -> "
              f"gols+SOT={v12['0.75']['taxa']:.1%} (n={v12['0.75']['n']})")
    print("  1X2 (previsão quando P máxima >= X):")
    for t, r in v12.items():
        print(f"    P>={t}: taxa={r['taxa']:.1%} (n={r['n']})")
    for mkt, nome in (("gols_over", "  Gols Over  (P>=0.85)"), ("gols_under", "  Gols Under (P>=0.85)")):
        print(f" {nome}:")
        for l, r in validacao(valid[mkt], mkt).items():
            print(f"    {float(l):>4.1f}: taxa={r['taxa']:.1%} (n={r['n']})")
    for mkt, nome in (("ht_over", "  Gols HT Over  (P>=0.80)"), ("ht_under", "  Gols HT Under (P>=0.80)")):
        print(f" {nome}:")
        for l, r in validacao(valid[mkt], mkt).items():
            print(f"    {float(l):>4.1f}: taxa={r['taxa']:.1%} (n={r['n']})")
    for mkt, nome in (("esc_over", "  Escanteios Over  (9.5+; P>=0.70)"), ("esc_under", "  Escanteios Under (9.5-; P>=0.70)")):
        print(f" {nome}:")
        for l, r in validacao(valid[mkt], mkt).items():
            print(f"    {float(l):>4.1f}: taxa={r['taxa']:.1%} (n={r['n']})")

    print("\n== Calibração com odds (fora de amostra) ==")
    cal12 = calibrar(valid["x12"], "x12")
    if cal12:
        print(f"  1X2: w={cal12['w']:.2f}  modelo={v12['0.75']['taxa']:.1%} -> calibrado={cal12['taxa']:.1%} (n={cal12['n']})")
    cal_gol_over = calibrar(valid["gols_over"], "gols_over")
    cal_gol_under = calibrar(valid["gols_under"], "gols_under")
    v_go = validacao(valid["gols_over"], "gols_over")
    v_gu = validacao(valid["gols_under"], "gols_under")
    for kl in ("2.5", "3.5", "4.5", "5.5"):
        if kl in cal_gol_over:
            r = cal_gol_over[kl]
            mod = v_go.get(kl)
            ms = f"{mod['taxa']:.1%} (n={mod['n']})" if mod else "—"
            print(f"  Gols Over {kl}: w={r['w']:.2f}  modelo={ms} -> calibrado={r['taxa']:.1%} (n={r['n']})")
        if kl in cal_gol_under:
            r = cal_gol_under[kl]
            mod = v_gu.get(kl)
            ms = f"{mod['taxa']:.1%} (n={mod['n']})" if mod else "—"
            print(f"  Gols Under {kl}: w={r['w']:.2f}  modelo={ms} -> calibrado={r['taxa']:.1%} (n={r['n']})")

    print(f"\n== Gerando JSON para o front ==")
    jogos = []
    for lg in ov.LEAGUES:
        rows = rows_all.get(lg["key"])
        if not rows:
            continue
        hist_names = set()
        for m in rows:
            hist_names.add(m["home"])
            hist_names.add(m["away"])
        norm_names = sorted({ov.norm(h) for h in hist_names})
        name_by_norm = {ov.norm(h): h for h in hist_names}
        state = State()
        if lg["key"] == "CDB":
            cdb_names = {ov.norm(h) for h in hist_names}
            bra_rows = rows_all.get("BRA", [])
            for bm in sorted(bra_rows, key=lambda x: (x["date"], x["home"])):
                home = ov.MAPA_BRA_CDB.get(bm["home"], bm["home"])
                away = ov.MAPA_BRA_CDB.get(bm["away"], bm["away"])
                if ov.norm(home) in cdb_names and ov.norm(away) in cdb_names:
                    state.advance({**bm, "home": home, "away": away})
        for m in rows:
            state.advance(m)
        rho = rho_map[lg["key"]]
        run_drift = league_drift(rows, best_w)
        sdates = {}
        for m in rows:
            sdates.setdefault(m["season"], []).append(m["date"])
        last_season = max(sdates, key=lambda s: max(sdates[s]))
        last_max = max(sdates[last_season])
        for f in ov.espn_fixtures(lg, args.days, data_dir, args.refresh):
            home = ov.map_team(f["home"], hist_names, norm_names, name_by_norm)
            away = ov.map_team(f["away"], hist_names, norm_names, name_by_norm)
            if not home or not away:
                print(f"  ? time não mapeado: {lg['nome']}: {f['home']} x {f['away']}")
                continue
            r = state.lambdas(home, away)
            if r is None:
                continue
            lam_h, lam_a = r["lam_h"], r["lam_a"]
            if best_w > 0 and r["lam_s"] is not None:
                lam_h = best_w * r["lam_s"][0] + (1 - best_w) * lam_h
                lam_a = best_w * r["lam_s"][1] + (1 - best_w) * lam_a
            fdate = dt.date.fromisoformat(f["date"][:10])
            if fdate <= last_max + dt.timedelta(days=45):
                ra, rp, n = run_drift.get(last_season, (0.0, 0.0, 0))
            else:
                p = run_drift.get(last_season, (0.0, 0.0, 0))
                ra, rp, n = p[0] * K_DISC, p[1] * K_DISC, p[2] * K_DISC
            k = drift_k(ra, rp, n)
            lam_h, lam_a = lam_h * k, lam_a * k
            jm = joint_metrics(lam_h, lam_a, rho)
            e, h = line_probs(r["lam_c"], r["lam_ht"], ESC_LINHAS)
            jogos.append({
                "liga": lg["nome"], "casa": f["home"], "fora": f["away"],
                "data": f["date"], "hora_br": fmt_br(f["date"]),
                "dados": "completo" if r["full"] else "parcial",
                "lam": round(lam_h + lam_a, 2),
                "lam_ht": None if r["lam_ht"] is None else round(r["lam_ht"][0] + r["lam_ht"][1], 2),
                "lam_esc": None if r["lam_c"] is None else round(r["lam_c"][0] + r["lam_c"][1], 2),
                "prob": {
                    "x1": round(jm["ph"], 4), "x": round(jm["pd"], 4), "x2": round(jm["pa"], 4),
                    "gols_over": [round(v, 4) for v in jm["gols_over"]],
                    "gols_under": [round(v, 4) for v in jm["gols_under"]],
                    "ht_over": [round(v, 4) for v in h["over"]],
                    "ht_under": [round(v, 4) for v in h["under"]],
                    "esc_over": [round(v, 4) for v in e["over"]],
                    "esc_under": [round(v, 4) for v in e["under"]],
                },
            })
    jogos.sort(key=lambda j: j["data"])
    out = {
        "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "validacao": {
            "x12": v12,
            "gols_over": validacao(valid["gols_over"], "gols_over"),
            "gols_under": validacao(valid["gols_under"], "gols_under"),
            "ht_over": validacao(valid["ht_over"], "ht_over"),
            "ht_under": validacao(valid["ht_under"], "ht_under"),
            "esc_over": validacao(valid["esc_over"], "esc_over"),
            "esc_under": validacao(valid["esc_under"], "esc_under"),
            "base_over15": round(base_tot["h"] / base_tot["n"], 4) if base_tot["n"] else None,
        },
        "cal": {"x12": cal12, "gols_over": cal_gol_over, "gols_under": cal_gol_under},
        "w_sot": best_w,
        "linhas_gols": GOL_LINHAS,
        "linhas_ht": HT_LINHAS,
        "linhas_esc": ESC_LINHAS,
        "jogos": jogos,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"  {len(jogos)} jogos exportados para {args.out}")


if __name__ == "__main__":
    main()
