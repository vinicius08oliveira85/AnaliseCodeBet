# Sistema de Previsão de Apostas (Poisson + Dixon-Coles)

Backend Python + frontend estático para previsão de resultados de futebol com modelo estatístico Poisson e ajuste de dependência Dixon-Coles.

## Como funciona

- Baixa dados históricos de `football-data.co.uk` e atualiza com corners/resultados da ESPN.
- Treina modelo Poisson com ajuste Dixon-Coles (rho) por liga.
- Inclui peso de chutes no alvo (SOT) e drift de temporada.
- Executa validação fora de amostra (walk-forward).
- Gera `front/analise.json` consumido pelo frontend estático.
- Coleta resultados ao vivo e valida previsões anteriores.

## Requisitos

- Python 3.10+
- Navegador moderno (frontend usa vanilla JS)
- Sem dependências externas Python (apenas stdlib + `over15.py`)

## Uso

```bash
python3 analise.py
```

Isso gera/atualiza `front/analise.json`.

Para servir o frontend:

```bash
npm run dev
# ou
python3 -m http.server 8000 --directory front
```

Para rodar os testes:

```bash
python3 test_app.py
```

## Deploy

Vercel aponta `outputDirectory` para `front/`. O JSON deve ser gerado localmente antes do deploy.

## Estrutura

- `analise.py` — modelo, backtest, previsão, coleta de resultados
- `over15.py` — fetch, normalização de nomes, aliases
- `test_app.py` — testes matemáticos e de schema do JSON
- `front/` — HTML/CSS/JS do frontend estático
