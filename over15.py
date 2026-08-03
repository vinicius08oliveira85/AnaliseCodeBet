#!/usr/bin/env python3
import csv
import datetime as dt
import difflib
import json
import re
import time
import unicodedata
import urllib.request
from pathlib import Path

LEAGUES = [
    {"key": "BRA", "nome": "Brasileirão Série A", "espn": "bra.1", "code": "BR1"},
    {"key": "CDB", "nome": "Copa do Brasil", "espn": "bra.copa_do_brazil", "code": "CDB", "espn_only": True},
    {"key": "ENG", "nome": "Premier League", "espn": "eng.1", "code": "E0"},
    {"key": "GER", "nome": "Bundesliga", "espn": "ger.1", "code": "D1"},
    {"key": "ITA", "nome": "Serie A (ITA)", "espn": "ita.1", "code": "I1"},
    {"key": "ESP", "nome": "LaLiga", "espn": "esp.1", "code": "SP1"},
    {"key": "FRA", "nome": "Ligue 1", "espn": "fra.1", "code": "F1"},
]

EU_SEASONS = ["2223", "2324", "2425", "2526"]
BR_SEASONS = ["2023", "2024", "2025", "2026"]
CDB_SEASONS = ["2024", "2025", "2026"]
TUNE_SEASON = {"BRA": "2025", "CDB": "2025"}
MIN_MATCHES = 4
GAMMA = 0.95
PRIOR = 2.0

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
    "leeds united": "Leeds", "leeds utd": "Leeds", "coventry city": "Coventry",
    "athletic club": "Ath Bilbao", "internazionale": "Inter",
    "fc cologne": "FC Koln", "1. fc koln": "FC Koln", "hamburg sv": "Hamburg",
    "stade rennais": "Rennes", "aj auxerre": "Auxerre", "as monaco": "Monaco",
    "monaco fc": "Monaco", "le havre ac": "Le Havre", "hsc montpellier": "Montpellier",
    "newcastle united": "Newcastle", "west ham united": "West Ham", "afc bournemouth": "Bournemouth",
    "aparecidense": "Aparecidense", "nova iguacu": "Nova Iguacu", "nova iguaçu": "Nova Iguacu",
    "maringa": "Maringa", "cascavel": "Cascavel", "manaus": "Manaus",
    "caxias do sul": "Caxias do Sul", "retro": "Retro", "retrô": "Retro",
    "brusque": "Brusque", "operario pr": "Operario PR", "operário pr": "Operario PR",
    "vila nova": "Vila Nova", "ponte preta": "Ponte Preta", "criciuma": "Criciuma",
    "botafogo pb": "Botafogo PB", "sao bernardo": "Sao Bernardo",
    "tombense": "Tombense", "sport recife": "Sport Recife", "america rn": "America RN",
    "america-rn": "America RN", "amazonas": "Amazonas", "amazonas fc": "Amazonas",
    "anapolis": "Anapolis", "aguia de maraba": "Aguia de Maraba",
    "uniao rondonopolis": "Uniao Rondonopolis", "olimpia": "Olimpia",
    "sampaio correa": "Sampaio Correa", "sampaio corrêa": "Sampaio Correa",
    "nautico": "Nautico", "abc": "ABC", "cs alagoano": "CSA", "csa": "CSA",
    "ituano": "Ituano", "paysandu": "Paysandu", "remo": "Remo", "clube do remo": "Remo",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]", "", s.lower())
    return re.sub(r"\s+", " ", s).strip()


ALIASES_NORM = {norm(k): v for k, v in ALIASES.items()}

MAPA_BRA_CDB = {
    "America MG": "América Mineiro",
    "Atletico GO": "Atlético Goianiense",
    "Atletico-MG": "Atlético-MG",
    "Avai": "Avaí",
    "Botafogo RJ": "Botafogo",
    "Bragantino": "Red Bull Bragantino",
    "Ceara": "Ceará",
    "Chapecoense-SC": "Chapecoense",
    "Criciuma": "Criciúma",
    "Cuiaba": "Cuiabá",
    "Flamengo RJ": "Flamengo",
    "Goias": "Goiás",
    "Gremio": "Grêmio",
    "Sao Paulo": "São Paulo",
    "Sport Recife": "Sport",
    "Vasco": "Vasco da Gama",
    "Vitoria": "Vitória",
    "Nautico": "Náutico",
    "Figueirense": "Figueirense",
    "Joinville": "Joinville",
    "Ponte Preta": "Ponte Preta",
    "Portuguesa": "Portuguesa",
    "Santa Cruz": "Santa Cruz",
}


def fetch(url, timeout=30):
    last = None
    for t in (1, 3, 8):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            last = e
            if t > 1:
                time.sleep(t)
    raise last


def parse_refresh(value):
    if not value:
        return set()
    if value == "all":
        return {"csv", "cdb", "corners", "fixtures"}
    return {x.strip().lower() for x in value.split(",") if x.strip()}


def download_csv(url, data_dir, name, refresh):
    path = data_dir / name
    now = dt.datetime.now().timestamp()
    if path.exists():
        if refresh:
            pass
        else:
            age = (now - path.stat().st_mtime) / 86400
            y = dt.date.today().year
            eu_cur = f"{str(y - 1)[2:]}{str(y)[2:]}"
            is_current = name.startswith("BRA") or eu_cur in name or str(y) in name
            stale = 2 if is_current else 30
            if age < stale:
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
        if lg.get("espn_only"):
            continue
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
        out.append({"date": ev["date"], "home": teams["home"], "away": teams["away"], "id": ev.get("id")})
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
