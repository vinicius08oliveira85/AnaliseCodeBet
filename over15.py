#!/usr/bin/env python3
import argparse
import csv
import datetime as dt
import difflib
import json
import math
import re
import unicodedata
import urllib.request
from pathlib import Path

LEAGUES = [
    {"key": "BRA", "nome": "Brasileirão Série A", "espn": "bra.1", "code": "BR1"},
    {"key": "ENG", "nome": "Premier League", "espn": "eng.1", "code": "E0"},
    {"key": "GER", "nome": "Bundesliga", "espn": "ger.1", "code": "D1"},
    {"key": "ITA", "nome": "Serie A (ITA)", "espn": "ita.1", "code": "I1"},
    {"key": "ESP", "nome": "LaLiga", "espn": "esp.1", "code": "SP1"},
    {"key": "FRA", "nome": "Ligue 1", "espn": "fra.1", "code": "F1"},
]

EU_SEASONS = ["2223", "2324", "2425", "2526"]
BR_SEASONS = ["2023", "2024", "2025", "2026"]
TUNE_SEASON = {"BRA": "2025"}
MIN_MATCHES = 4
SEASON_BLEND = 0.5

ALIASES = {
    "man city": "Man City", "manchester city": "Man City", "man utd": "Man United",
    "manchester united": "Man United", "man united": "Man United", "newcastle": "Newcastle",
    "tottenham": "Tottenham", "tottenham hotspur": "Tottenham", "west ham": "West Ham",
    "wolverhampton": "Wolves", "wolverhampton wanderers": "Wolves", "leeds": "Leeds",
    "leicester": "Leicester", "brighton & hove albion": "Brighton",
    "brighton and hove albion": "Brighton", "ipswich": "Ipswich", "ipswich town": "Ipswich",
    "nott'm forest": "Nott'm Forest", "nottingham forest": "Nott'm Forest",
    "luton": "Luton", "luton town": "Luton",
    "crystal palace": "Crystal Palace", "bayern munich": "Bayern Munich",
    "bayer leverkusen": "Leverkusen", "leverkusen": "Leverkusen",
    "borussia dortmund": "Dortmund", "dortmund": "Dortmund",
    "borussia monchengladbach": "M'gladbach", "borussia m'gladbach": "M'gladbach",
    "m'gladbach": "M'gladbach", "eintracht frankfurt": "Ein Frankfurt", "frankfurt": "Ein Frankfurt",
    "werder bremen": "Werder Bremen", "bremen": "Werder Bremen", "mainz 05": "Mainz", "mainz": "Mainz",
    "fsv mainz 05": "Mainz",
    "sc freiburg": "Freiburg", "freiburg": "Freiburg", "fc koln": "FC Koln", "koln": "FC Koln",
    "hamburger sv": "Hamburg", "vfb stuttgart": "Stuttgart",
    "tsg hoffenheim": "Hoffenheim", "hoffenheim": "Hoffenheim", "vfl wolfsburg": "Wolfsburg",
    "wolfsburg": "Wolfsburg", "fc augsburg": "Augsburg", "augsburg": "Augsburg",
    "1. fc union berlin": "Union Berlin", "union berlin": "Union Berlin",
    "vfl bochum": "Bochum", "bochum": "Bochum", "1. fc heidenheim": "Heidenheim",
    "fc heidenheim": "Heidenheim", "heidenheim": "Heidenheim", "fc st. pauli": "St Pauli",
    "st. pauli": "St Pauli", "st pauli": "St Pauli", "holstein kiel": "Holstein Kiel",
    "ac milan": "Milan", "milan": "Milan", "inter": "Inter", "inter milan": "Inter",
    "as roma": "Roma", "roma": "Roma", "lazio": "Lazio", "napoli": "Napoli",
    "juventus": "Juventus", "atalanta": "Atalanta", "fiorentina": "Fiorentina",
    "bologna": "Bologna", "torino": "Torino", "udinese": "Udinese", "genoa": "Genoa",
    "cagliari": "Cagliari", "parma": "Parma", "hellas verona": "Verona", "verona": "Verona",
    "como": "Como", "monza": "Monza", "lecce": "Lecce", "empoli": "Empoli",
    "venezia": "Venezia", "sassuolo": "Sassuolo", "salernitana": "Salernitana",
    "cremonese": "Cremonese", "spezia": "Spezia", "sampdoria": "Sampdoria",
    "fc barcelona": "Barcelona", "barcelona": "Barcelona", "atletico madrid": "Ath Madrid",
    "athletic bilbao": "Ath Bilbao", "real betis": "Betis", "betis": "Betis",
    "sevilla": "Sevilla", "valencia": "Valencia", "villarreal": "Villarreal",
    "real sociedad": "Sociedad", "girona": "Girona", "osasuna": "Osasuna",
    "celta vigo": "Celta", "rayo vallecano": "Vallecano", "getafe": "Getafe",
    "deportivo alaves": "Alaves", "alaves": "Alaves", "mallorca": "Mallorca",
    "las palmas": "Las Palmas", "espanyol": "Espanol", "leganes": "Leganes",
    "valladolid": "Valladolid", "cadiz": "Cadiz", "granada": "Granada", "elche": "Elche",
    "levante": "Levante", "huesca": "Huesca", "almeria": "Almeria", "eibar": "Eibar",
    "paris saint-germain": "Paris SG", "paris sg": "Paris SG", "psg": "Paris SG", "marseille": "Marseille",
    "olympique marseille": "Marseille", "lyon": "Lyon", "monaco": "Monaco", "lille": "Lille",
    "nice": "Nice", "rc lens": "Lens", "lens": "Lens", "rennes": "Rennes",
    "strasbourg": "Strasbourg", "nantes": "Nantes", "fc nantes": "Nantes",
    "montpellier": "Montpellier", "stade de reims": "Reims", "reims": "Reims",
    "toulouse": "Toulouse", "stade brestois": "Brest", "brest": "Brest", "auxerre": "Auxerre",
    "angers": "Angers", "angers sco": "Angers", "le havre": "Le Havre",
    "le havre ac": "Le Havre",     "as saint-etienne": "St Etienne", "saint-etienne": "St Etienne",
    "saint etienne": "St Etienne", "metz": "Metz", "clermont": "Clermont",
    "lorient": "Lorient", "troyes": "Troyes",
    "athletico paranaense": "Athletico-PR", "athletico-pr": "Athletico-PR",
    "atletico mineiro": "Atletico-MG", "atletico-mg": "Atletico-MG", "atletico mg": "Atletico-MG",
    "sao paulo": "Sao Paulo", "gremio": "Gremio", "internacional": "Internacional",
    "fluminense": "Fluminense", "vasco da gama": "Vasco", "vasco": "Vasco",
    "rb bragantino": "Bragantino", "bragantino": "Bragantino", "coritiba": "Coritiba",
    "fortaleza": "Fortaleza", "bahia": "Bahia", "ceara": "Ceara", "ceara sc": "Ceara",
    "juventude": "Juventude", "cuiaba": "Cuiaba", "cuiaba ec": "Cuiaba", "goias": "Goias",
    "america mineiro": "America MG", "america-mg": "America MG", "america mg": "America MG",
    "corinthians": "Corinthians", "palmeiras": "Palmeiras", "santos": "Santos",
    "cruzeiro": "Cruzeiro", "botafogo": "Botafogo RJ", "flamengo": "Flamengo RJ",
    "red bull bragantino": "Bragantino", "vitoria": "Vitoria",
    "hull city": "Hull", "southampton": "Southampton", "bournemouth": "Bournemouth",
    "everton": "Everton", "fulham": "Fulham", "arsenal": "Arsenal", "chelsea": "Chelsea",
    "aston villa": "Aston Villa", "brentford": "Brentford",
    "newcastle united": "Newcastle", "west ham united": "West Ham", "afc bournemouth": "Bournemouth",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]", "", s.lower())
    return re.sub(r"\s+", " ", s).strip()


ALIASES_NORM = {norm(k): v for k, v in ALIASES.items()}


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def download_csv(url, data_dir, name, refresh):
    path = data_dir / name
    if path.exists() and not refresh:
        return path
    try:
        body = fetch(url)
    except Exception as e:
        print(f"  ! falha ao baixar {url}: {e}")
        return None
    path.write_text(body)
    return path


def parse_date(s):
    return dt.datetime.strptime(s.strip(), "%d/%m/%Y").date()


def _float(s):
    try:
        v = float(s)
        return v if v > 1 else None
    except (TypeError, ValueError):
        return None


def _goals(s):
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def load_history(data_dir, refresh):
    hist = {}
    for lg in LEAGUES:
        rows = []
        if lg["key"] == "BRA":
            p = download_csv("https://www.football-data.co.uk/new/BRA.csv", data_dir, "BRA.csv", refresh)
            if not p:
                continue
            with open(p, newline="", encoding="utf-8-sig") as f:
                for r in csv.DictReader(f):
                    if r["Season"] not in BR_SEASONS:
                        continue
                    try:
                        d = parse_date(r["Date"])
                    except ValueError:
                        continue
                    hg, ag = _goals(r.get("HG")), _goals(r.get("AG"))
                    if hg is None or ag is None:
                        continue
                    rows.append({"date": d, "season": r["Season"], "home": r["Home"], "away": r["Away"],
                                 "hg": hg, "ag": ag})
        else:
            for seas in EU_SEASONS:
                p = download_csv(f"https://www.football-data.co.uk/mmz4281/{seas}/{lg['code']}.csv",
                                 data_dir, f"{lg['code']}_{seas}.csv", refresh)
                if not p:
                    continue
                with open(p, newline="", encoding="utf-8-sig") as f:
                    for r in csv.DictReader(f):
                        if not r.get("HomeTeam"):
                            continue
                        try:
                            d = parse_date(r["Date"])
                        except ValueError:
                            continue
                        hg, ag = _goals(r.get("FTHG")), _goals(r.get("FTAG"))
                        if hg is None or ag is None:
                            continue
                        rows.append({"date": d, "season": seas, "home": r["HomeTeam"], "away": r["AwayTeam"],
                                     "hg": hg, "ag": ag,
                                     "over": _float(r.get("AvgC>2.5")), "under": _float(r.get("AvgC<2.5"))})
        rows.sort(key=lambda m: (m["date"], m["season"]))
        hist[lg["key"]] = rows
    return hist


class LeagueState:
    def __init__(self):
        self.base_h = 0.0
        self.base_a = 0.0
        self.base_n = 0
        self.teams = {}

    def _bucket(self, team, role):
        t = self.teams.get(team)
        if t is None:
            t = self.teams[team] = {
                "home": {"cur_seas": None, "cur_n": 0, "cur_gf": 0.0, "cur_ga": 0.0,
                         "prev_n": 0, "prev_gf": 0.0, "prev_ga": 0.0},
                "away": {"cur_seas": None, "cur_n": 0, "cur_gf": 0.0, "cur_ga": 0.0,
                         "prev_n": 0, "prev_gf": 0.0, "prev_ga": 0.0},
            }
        return t[role]

    def advance(self, m):
        self.base_h += m["hg"]
        self.base_a += m["ag"]
        self.base_n += 1
        for role, name, scored, conceded in (
                ("home", m["home"], m["hg"], m["ag"]),
                ("away", m["away"], m["ag"], m["hg"])):
            b = self._bucket(name, role)
            if b["cur_seas"] is not None and b["cur_seas"] != m["season"]:
                b["prev_n"] += b["cur_n"]
                b["prev_gf"] += b["cur_gf"]
                b["prev_ga"] += b["cur_ga"]
                b["cur_n"] = 0
                b["cur_gf"] = 0.0
                b["cur_ga"] = 0.0
            b["cur_seas"] = m["season"]
            b["cur_n"] += 1
            b["cur_gf"] += scored
            b["cur_ga"] += conceded

    def team_stats(self, team, role):
        b = self._bucket(team, role)
        raw_n = b["cur_n"] + b["prev_n"]
        if raw_n < MIN_MATCHES:
            return None
        n = b["cur_n"] + SEASON_BLEND * b["prev_n"]
        gf = (b["cur_gf"] + SEASON_BLEND * b["prev_gf"]) / n
        ga = (b["cur_ga"] + SEASON_BLEND * b["prev_ga"]) / n
        return {"gf": gf, "ga": ga, "n": raw_n}

    def prob_over15(self, home, away):
        if self.base_n == 0:
            return None
        base_h = self.base_h / self.base_n
        base_a = self.base_a / self.base_n
        sh = self.team_stats(home, "home")
        sa = self.team_stats(away, "away")
        gh = self.team_stats(home, "away")
        ga = self.team_stats(away, "home")
        full = all(s is not None for s in (sh, sa, gh, ga))
        if not full:
            sh = sh or {"gf": base_h, "ga": base_a}
            sa = sa or {"gf": base_a, "ga": base_h}
            gh = gh or {"gf": base_a, "ga": base_h}
            ga = ga or {"gf": base_h, "ga": base_a}
        lam_h = sh["gf"] * ga["ga"] / base_a if base_a else 0.0
        lam_a = sa["gf"] * gh["ga"] / base_h if base_h else 0.0
        lam = lam_h + lam_a
        p = 1.0 - math.exp(-lam) * (1.0 + lam)
        return {"p": p, "lam": lam, "full": full}


def market_lambda(over, under):
    if not over or not under:
        return None
    q = (1.0 / over) / (1.0 / over + 1.0 / under)
    q = min(max(q, 0.01), 0.99)
    lo, hi = 0.0, 10.0
    for _ in range(80):
        mid = (lo + hi) / 2.0
        f = 1.0 - math.exp(-mid) * (1.0 + mid + mid * mid / 2.0)
        if f < q:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def blend_p(model_lam, over, under, w):
    lm = market_lambda(over, under)
    if lm is None:
        return None
    lam = w * lm + (1.0 - w) * model_lam
    return 1.0 - math.exp(-lam) * (1.0 + lam)


def model_p(lam):
    return 1.0 - math.exp(-lam) * (1.0 + lam)


def brier_score(items, w=None):
    s, n = 0.0, 0
    for x in items:
        p = blend_p(x["lam"], x["over"], x["under"], w) if w is not None else model_p(x["lam"])
        if p is None:
            continue
        s += (p - (1.0 if x["hit"] else 0.0)) ** 2
        n += 1
    return s / n if n else None


def best_weight(tune_items):
    items = [x for x in tune_items if x["over"] and x["under"]]
    if not items:
        return 0.5
    best_w, best_b = 0.5, None
    for w in [round(0.05 * i, 2) for i in range(21)]:
        b = brier_score(items, w)
        if best_b is None or b < best_b:
            best_b, best_w = b, w
    return best_w


def blended_items(items, w):
    out = []
    for x in items:
        p = blend_p(x["lam"], x["over"], x["under"], w)
        if p is None:
            continue
        out.append({"p": p, "hit": x["hit"]})
    return out


def backtest(rows, tune_season):
    out = []
    state = LeagueState()
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
    for d in sorted(by_day):
        ms = by_day[d]
        if d >= tune_start:
            for m in ms:
                r = state.prob_over15(m["home"], m["away"])
                if r is None:
                    continue
                out.append({"p": r["p"], "lam": r["lam"], "full": r["full"],
                            "hit": m["hg"] + m["ag"] > 1.5,
                            "season": m["season"], "date": d,
                            "over": m.get("over"), "under": m.get("under")})
        for m in ms:
            state.advance(m)
    return out


def pick_threshold(tune_items, valid_items, target=0.75, min_n=50):
    best = None
    for t in [round(0.60 + 0.005 * i, 3) for i in range(61)]:
        ts = [x for x in tune_items if x["p"] >= t]
        vs = [x for x in valid_items if x["p"] >= t]
        if len(ts) < min_n or len(vs) < 100:
            continue
        tr = sum(1 for x in ts if x["hit"]) / len(ts)
        vr = sum(1 for x in vs if x["hit"]) / len(vs)
        if tr >= target and vr >= target:
            best = {"t": t, "tr": tr, "vr": vr, "nt": len(ts), "nv": len(vs)}
    return best


def hit_table(items, thresholds):
    tbl = []
    for t in thresholds:
        sel = [x for x in items if x["p"] >= t]
        if not sel:
            continue
        tbl.append({"t": t, "n": len(sel),
                    "rate": sum(1 for x in sel if x["hit"]) / len(sel)})
    return tbl


def espn_fixtures(lg, days, data_dir, refresh):
    out = []
    today = dt.date.today()
    end = today + dt.timedelta(days=days)
    cache = data_dir / f"espn_{lg['espn']}_{today:%Y%m%d}-{end:%Y%m%d}.json"
    cache_date = dt.date.fromtimestamp(cache.stat().st_mtime) if cache.exists() else None
    if cache.exists() and not refresh and cache_date == today:
        body = cache.read_text()
    else:
        try:
            url = (f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg['espn']}/scoreboard"
                   f"?dates={today:%Y%m%d}-{end:%Y%m%d}")
            body = fetch(url, timeout=20)
            cache.write_text(body)
        except Exception as e:
            print(f"  ! falha ESPN {lg['espn']}: {e}")
            return out
    try:
        data = json.loads(body)
    except Exception:
        return out
    now = dt.datetime.now(dt.timezone.utc)
    for ev in data.get("events", []):
        comp = ev["competitions"][0]
        if comp["status"]["type"]["name"] != "STATUS_SCHEDULED":
            continue
        try:
            kickoff = dt.datetime.fromisoformat(ev["date"].replace("Z", "+00:00"))
        except ValueError:
            continue
        if kickoff < now:
            continue
        teams = {c["homeAway"]: c["team"]["displayName"] for c in comp["competitors"]}
        if "home" not in teams or "away" not in teams:
            continue
        out.append({"date": ev["date"], "home": teams["home"], "away": teams["away"]})
    return out


def map_team(name, hist_names, norm_names, name_by_norm):
    n = norm(name)
    if n in ALIASES_NORM:
        cand = ALIASES_NORM[n]
        if cand in hist_names:
            return cand
    if n in name_by_norm:
        return name_by_norm[n]
    m = difflib.get_close_matches(n, norm_names, n=1, cutoff=0.85)
    if m:
        return name_by_norm[m[0]]
    return None


def load_ou(path):
    ou = {}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            liga = (r.get("liga") or "").strip().upper()
            if not liga or liga not in ou:
                ou[liga] = {}
            ov = _float(r.get("over"))
            un = _float(r.get("under"))
            if not ov or not un:
                continue
            ou[liga][(norm(r.get("casa") or ""), norm(r.get("fora") or ""))] = (ov, un)
    return ou


def fmt_dt(iso):
    try:
        u = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso
    br = u + dt.timedelta(hours=-3)
    return f"{br:%d/%m %H:%M} (BR)"


def main():
    ap = argparse.ArgumentParser(description="Filtro Over 1.5 gols - Brasil + Top5 europeias")
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--target", type=float, default=0.75)
    ap.add_argument("--min-n", type=int, default=50)
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--ou", default=None, help="CSV com odds: liga,casa,fora,over,under")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    data_dir.mkdir(exist_ok=True)

    print("== Baixando histórico (football-data.co.uk) ...")
    hist = load_history(data_dir, args.refresh)

    print("\n== Backtest walk-forward ==")
    tune_items, valid_items = [], []
    per_league = {}
    for lg in LEAGUES:
        rows = hist.get(lg["key"])
        if not rows:
            continue
        tune_season = TUNE_SEASON.get(lg["key"], "2425")
        items = backtest(rows, tune_season)
        tune_items += [x for x in items if x["season"] == tune_season]
        valid_items += [x for x in items if x["season"] != tune_season]
        n_h = sum(1 for x in items if x["hit"])
        per_league[lg["key"]] = {"nome": lg["nome"], "n": len(items), "base": n_h / len(items) if items else 0}

    total = sum(v["n"] for v in per_league.values())
    base_all = sum(v["n"] * v["base"] for v in per_league.values()) / total if total else 0
    print(f"  Taxa base de Over 1.5 (todos os jogos): {base_all:.1%}")
    for k, v in per_league.items():
        print(f"    {v['nome']:<22} n={v['n']:>5}  base={v['base']:.1%}")

    thr_info = pick_threshold(tune_items, valid_items, args.target, args.min_n)
    thr = args.threshold if args.threshold is not None else (thr_info["t"] if thr_info else None)
    if args.threshold is not None:
        ts = [x for x in tune_items if x["p"] >= args.threshold]
        vs = [x for x in valid_items if x["p"] >= args.threshold]
        tune_rate = sum(1 for x in ts if x["hit"]) / len(ts) if ts else 0
        valid_rate = sum(1 for x in vs if x["hit"]) / len(vs) if vs else 0
    elif thr_info:
        tune_rate, valid_rate = thr_info["tr"], thr_info["vr"]
    if thr is None:
        print("\n  Nenhum threshold atingiu a meta em treino E validação. "
              "Tente --target menor ou --min-n menor.")
        thr = 0.60
        ts = [x for x in tune_items if x["p"] >= thr]
        tune_rate = sum(1 for x in ts if x["hit"]) / len(ts) if ts else 0
        vs = [x for x in valid_items if x["p"] >= thr]
        valid_rate = sum(1 for x in vs if x["hit"]) / len(vs) if vs else 0
    print(f"\n  Threshold P(Over 1.5): {thr:.3f}")
    print(f"  Treino: taxa = {tune_rate:.1%} (n={len([x for x in tune_items if x['p'] >= thr])})")
    print(f"  Validação fora de amostra: taxa = {valid_rate:.1%} (n={len([x for x in valid_items if x['p'] >= thr])})")
    print("  Dica: use --threshold <valor> para mais/menos seletividade.")

    w = best_weight(tune_items)
    bm_t, bb_t = brier_score(tune_items), brier_score(tune_items, w)
    bm_v, bb_v = brier_score(valid_items), brier_score(valid_items, w)
    bl_v = blended_items(valid_items, w)
    bl_hits = sum(1 for x in bl_v if x["p"] >= thr and x["hit"])
    bl_n = sum(1 for x in bl_v if x["p"] >= thr)
    vh = sum(1 for x in valid_items if x["p"] >= thr and x["hit"])
    vn = sum(1 for x in valid_items if x["p"] >= thr)
    print("\n== Calibração com odds de mercado (O/U 2.5 fechadas) ==")
    print(f"  Peso ótimo do mercado (w) no treino: {w:.2f}")
    print(f"  Brier treino:  modelo={bm_t:.4f}  com odds={bb_t:.4f}")
    print(f"  Brier validação: modelo={bm_v:.4f}  com odds={bb_v:.4f}")
    if vn:
        print(f"  Taxa no threshold {thr:.2f} (validação): modelo={vh/vn:.1%} (n={vn})  "
              f"com odds={bl_hits/bl_n:.1%} (n={bl_n})")
    print("\n== Tabela por faixa (VALIDAÇÃO com odds) ==")
    tbl = hit_table(bl_v, [round(0.60 + 0.02 * i, 2) for i in range(16)])
    print("  P>=     n  acertos   taxa")
    for r in tbl:
        print(f"  {r['t']:.2f} {r['n']:>5} {round(r['n']*r['rate']):>7} {r['rate']:>7.1%}")

    print("\n== Tabela por faixa de probabilidade ==")
    print("  TREINO")
    tbl = hit_table(tune_items, [round(0.60 + 0.02 * i, 2) for i in range(16)])
    print("  P>=     n  acertos   taxa")
    for r in tbl:
        print(f"  {r['t']:.2f} {r['n']:>5} {round(r['n']*r['rate']):>7} {r['rate']:>7.1%}")
    print("  VALIDAÇÃO")
    tbl = hit_table(valid_items, [round(0.60 + 0.02 * i, 2) for i in range(16)])
    print("  P>=     n  acertos   taxa")
    for r in tbl:
        print(f"  {r['t']:.2f} {r['n']:>5} {round(r['n']*r['rate']):>7} {r['rate']:>7.1%}")

    print(f"\n== Próximos jogos ({args.days} dias) que passam no filtro (P >= {thr:.2f}) ==")
    ou = load_ou(args.ou) if args.ou else {}
    uniq = {}
    for lg in LEAGUES:
        rows = hist.get(lg["key"])
        if not rows:
            continue
        hist_names = set()
        for m in rows:
            hist_names.add(m["home"])
            hist_names.add(m["away"])
        norm_names = sorted({norm(h) for h in hist_names})
        name_by_norm = {norm(h): h for h in hist_names}
        state = LeagueState()
        for m in rows:
            state.advance(m)
        for f in espn_fixtures(lg, args.days, data_dir, args.refresh):
            home = map_team(f["home"], hist_names, norm_names, name_by_norm)
            away = map_team(f["away"], hist_names, norm_names, name_by_norm)
            if not home or not away:
                print(f"  ? time não mapeado: {lg['nome']}: {f['home']} x {f['away']}")
                continue
            r = state.prob_over15(home, away)
            if r is None or r["p"] < 0.75:
                continue
            key = (lg["key"], home, away)
            if key not in uniq:
                ou_rec = (ou.get(lg["key"], {}).get((norm(f["home"]), norm(f["away"])))
                          or ou.get(lg["key"], {}).get((norm(home), norm(away))))
                pb = blend_p(r["lam"], ou_rec[0], ou_rec[1], w) if ou_rec else None
                uniq[key] = {"nome": lg["nome"], "p": r["p"], "pb": pb, "full": r["full"],
                             "eh": f["home"], "ea": f["away"], "date": f["date"]}
    qual = sorted([q for q in uniq.values() if (q["pb"] if q["pb"] is not None else q["p"]) >= thr],
                  key=lambda x: -(x["pb"] if x["pb"] is not None else x["p"]))
    bons = sorted([q for q in uniq.values() if (q["pb"] if q["pb"] is not None else q["p"]) < thr],
                  key=lambda x: -(x["pb"] if x["pb"] is not None else x["p"]))
    if not qual and not bons:
        print("  Nenhum jogo nos próximos dias. Tente --days maior.")
    for q in qual:
        flag = "" if q["full"] else " [dados parciais]"
        p = q["pb"] if q["pb"] is not None else q["p"]
        tag = f"  P={p:.1%}"
        if q["pb"] is not None:
            tag += f" (com odds; modelo {q['p']:.1%})"
        print(f"  {q['nome']:<22} {q['eh']} x {q['ea']}{tag}{flag}  ({fmt_dt(q['date'])})")
    for q in bons:
        flag = "" if q["full"] else " [dados parciais]"
        p = q["pb"] if q["pb"] is not None else q["p"]
        print(f"  {q['nome']:<22} {q['eh']} x {q['ea']}  P={p:.1%} (abaixo do threshold){flag}  ({fmt_dt(q['date'])})")
    if len(qual) >= 2:
        comb = 1.0
        for q in qual:
            comb *= (q["pb"] if q["pb"] is not None else q["p"])
        print(f"\n  Combinação de {len(qual)} seleções: P combinado = {comb:.1%}")
        print("  Atenção: P combinado = produto das probabilidades individuais.")
    if args.ou:
        print(f"  Obs.: odds lidas de {args.ou}; w={w:.2f}")
    print("\n  Aviso: taxa histórica não garante resultado futuro. Aposte com responsabilidade.")


if __name__ == "__main__":
    main()
