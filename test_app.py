#!/usr/bin/env python3
import json
import math
import unittest
from pathlib import Path

import analise as an
import over15 as ov

ROOT = Path(__file__).parent


class TestCore(unittest.TestCase):
    def test_x12_probabilities(self):
        for lh, la in ((0.5, 0.5), (1.2, 0.9), (2.5, 1.8), (0.3, 3.0)):
            for rho in (-0.2, 0.0, 0.05):
                ph, pd, pa = an.x12(lh, la, rho)
                self.assertAlmostEqual(ph + pd + pa, 1.0, places=6)
                self.assertTrue(all(0 <= p <= 1 for p in (ph, pd, pa)))

    def test_cdf_pois(self):
        self.assertAlmostEqual(an.cdf_pois(0, 1.0), math.exp(-1.0), places=9)
        self.assertAlmostEqual(an.cdf_pois(100, 1.0), 1.0, places=9)
        self.assertAlmostEqual(an.cdf_pois(0, 0.0), 1.0, places=9)

    def test_joint_metrics(self):
        for lh, la in ((0.5, 0.5), (1.2, 0.9), (2.5, 1.8), (0.3, 3.0)):
            for rho in (-0.2, 0.0, 0.05):
                jm = an.joint_metrics(lh, la, rho)
                self.assertAlmostEqual(jm["ph"] + jm["pd"] + jm["pa"], 1.0, places=6)
                self.assertAlmostEqual(jm["gols_over"][0], 1.0 - jm["gols_under"][0], places=9)
                self.assertEqual(len(jm["gols_over"]), len(an.GOL_LINHAS))
                self.assertTrue(all(a >= b for a, b in zip(jm["gols_over"], jm["gols_over"][1:])))
                self.assertTrue(all(0 <= p <= 1 for p in jm["gols_over"]))

    def test_aliases_norm_consistent(self):
        seen = {}
        for k, v in ov.ALIASES.items():
            nk = ov.norm(k)
            if nk in seen:
                self.assertEqual(seen[nk], v,
                                 f"colisao de alias com valores diferentes: {nk!r}")
            else:
                seen[nk] = v

    def test_map_team_aliases(self):
        rows = ov.load_history(ROOT / "data", False)
        names = set()
        for lg in ov.LEAGUES:
            for m in rows.get(lg["key"], []):
                names.add(m["home"])
                names.add(m["away"])
        norm_names = sorted({ov.norm(n) for n in names})
        by_norm = {ov.norm(n): n for n in names}
        casos = {
            "Atletico Madrid": "Ath Madrid",
            "Celta Vigo": "Celta",
            "Rayo Vallecano": "Vallecano",
            "Real Sociedad": "Sociedad",
            "Real Betis": "Betis",
            "Athletic Bilbao": "Ath Bilbao",
            "Espanyol": "Espanol",
            "Eintracht Frankfurt": "Ein Frankfurt",
            "Koln": "FC Koln",
            "Werder Bremen": "Werder Bremen",
            "Paris Saint-Germain": "Paris SG",
            "America Mineiro": "America MG",
            "Nottingham Forest": "Nott'm Forest",
        }
        for fonte, alvo in casos.items():
            self.assertEqual(ov.map_team(fonte, names, norm_names, by_norm), alvo,
                             f"alias '{fonte}' -> '{alvo}'")


class TestFrontJson(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "front" / "analise.json").read_text())

    def test_jogo_keys(self):
        for j in self.data["jogos"]:
            self.assertIn("lam", j)
            for k in ("x1", "x", "x2", "gols_over", "gols_under",
                      "ht_over", "ht_under", "esc_over", "esc_under"):
                self.assertIn(k, j["prob"])
            self.assertEqual(len(j["prob"]["gols_over"]), len(an.GOL_LINHAS))
            self.assertEqual(len(j["prob"]["gols_under"]), len(an.GOL_LINHAS))
            if j["prob"]["esc_over"]:
                self.assertEqual(len(j["prob"]["esc_over"]), len(an.ESC_LINHAS))

    def test_x12_sums_one(self):
        for j in self.data["jogos"]:
            p = j["prob"]
            self.assertAlmostEqual(p["x1"] + p["x"] + p["x2"], 1.0, places=3)

    def test_validacao_min_sample(self):
        v = self.data["validacao"]
        for lado in ("over", "under"):
            for l in an.GOL_LINHAS:
                if f"{l:g}" in v[f"gols_{lado}"]:
                    self.assertGreaterEqual(v[f"gols_{lado}"][f"{l:g}"]["n"], 30)
        for mkt in ("ht_over", "ht_under"):
            for l in an.HT_LINHAS:
                if f"{l:g}" in v[mkt]:
                    self.assertGreaterEqual(v[mkt][f"{l:g}"]["n"], 30)
        for mkt in ("esc_over", "esc_under"):
            for l in an.ESC_LINHAS:
                if f"{l:g}" in v[mkt]:
                    self.assertGreaterEqual(v[mkt][f"{l:g}"]["n"], 30)

    def test_jogos_sorted_by_date(self):
        dates = [j["data"] for j in self.data["jogos"]]
        self.assertEqual(dates, sorted(dates))

    def test_ao_vivo_key(self):
        self.assertIn("ao_vivo", self.data)
        av = self.data["ao_vivo"]
        for k in ("n", "picks_n", "hit", "thr", "por_mercado", "por_liga"):
            self.assertIn(k, av)


class TestAoVivo(unittest.TestCase):
    def test_picks_previsao(self):
        j = {"liga": "T",
             "prob": {"x1": 0.45, "x": 0.28, "x2": 0.27,
                      "gols_over": [0.9, 0.7, 0.55, 0.35, 0.2, 0.1],
                      "gols_under": [0.1, 0.3, 0.45, 0.65, 0.8, 0.9],
                      "ht_over": [0.75, 0.4, 0.2, 0.1],
                      "ht_under": [0.25, 0.6, 0.8, 0.9],
                      "esc_over": [0.85, 0.75, 0.62, 0.5, 0.38, 0.3],
                      "esc_under": [0.15, 0.25, 0.38, 0.5, 0.62, 0.7]}}
        picks = an.picks_previsao(j)
        tipos = {p["tipo"] for p in picks}
        self.assertIn("x12", tipos)
        self.assertIn("dc", tipos)
        self.assertIn("gols_over", tipos)
        self.assertIn("ht_over", tipos)
        self.assertIn("esc_over", tipos)
        self.assertTrue(all(0 <= p["p"] <= 1 for p in picks))
        dcs = {p["linha"] for p in picks if p["tipo"] == "dc"}
        self.assertEqual(dcs, {"1x", "x2", "12"})

    def test_validacao_ao_vivo(self):
        j = {"liga": "T", "casa": "A", "fora": "B", "odds": None,
             "prob": {"x1": 0.45, "x": 0.28, "x2": 0.27,
                      "gols_over": [0.9, 0.7, 0.55, 0.35, 0.2, 0.1],
                      "gols_under": [0.1, 0.3, 0.45, 0.65, 0.8, 0.9],
                      "ht_over": [0.75, 0.4, 0.2, 0.1],
                      "ht_under": [0.25, 0.6, 0.8, 0.9],
                      "esc_over": [0.85, 0.75, 0.62, 0.5, 0.38, 0.3],
                      "esc_under": [0.15, 0.25, 0.38, 0.5, 0.62, 0.7]}}
        prevs = [{"id": "1", "liga": "T", "casa": "A", "fora": "B",
                  "data": "2026-07-01T19:00:00Z", "picks": an.picks_previsao(j)}]
        res = {"1": {"hg": 2, "ag": 1, "hhg": 1, "hag": 0, "hc": 6, "ac": 8}}
        av = an.validacao_ao_vivo(prevs, res)
        self.assertEqual(av["n"], 1)
        self.assertGreater(av["picks_n"], 0)
        self.assertEqual(av["hit"], av["picks_n"] - 1)
        self.assertIn("dc_1x", av["por_mercado"])
        self.assertTrue(av["por_mercado"]["gols_over_1.5"]["hit"] == 1)
        self.assertTrue(av["por_mercado"]["esc_under_12.5"]["hit"] == 0)
        self.assertEqual(av["por_liga"][0]["games"], 1)

    def test_pick_ok_mercados(self):
        r = {"hg": 1, "ag": 1, "hhg": 0, "hag": 1, "hc": 5, "ac": 7}
        self.assertTrue(an.pick_ok({"tipo": "x12", "linha": 1}, r))
        self.assertFalse(an.pick_ok({"tipo": "x12", "linha": 0}, r))
        self.assertTrue(an.pick_ok({"tipo": "dc", "linha": "1x"}, r))
        self.assertTrue(an.pick_ok({"tipo": "gols_over", "linha": 1.5}, r))
        self.assertFalse(an.pick_ok({"tipo": "gols_over", "linha": 2.5}, r))
        self.assertTrue(an.pick_ok({"tipo": "ht_under", "linha": 2.5}, r))
        self.assertTrue(an.pick_ok({"tipo": "esc_over", "linha": 7.5}, r))
        self.assertIsNone(an.pick_ok({"tipo": "esc_over", "linha": 7.5},
                                     {"hg": 1, "ag": 1, "hc": None, "ac": None}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
