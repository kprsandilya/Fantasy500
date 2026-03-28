"""Fetch S&P 500 constituent tickers from Wikipedia and load market data via yfinance."""

from io import StringIO
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

# Scrape S&P 500 tickers from Wikipedia (403 without a real User-Agent)
url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
headers = {
    "User-Agent": "Fantasy500/1.0 (S&P500 data fetch; Python requests)",
    "Accept-Language": "en-US,en;q=0.9",
}
response = requests.get(url, headers=headers, timeout=30)
response.raise_for_status()
table = pd.read_html(StringIO(response.text))
df_constituents = table[0].copy()
tickers = df_constituents["Symbol"].tolist()
tickers = [s.replace(".", "-") for s in tickers]

# Daily bars; we only export Close below. Adjust period for more history.
ohlcv = yf.download(
    tickers=tickers,
    period="5d",
    interval="1d",
    group_by="ticker",
    threads=True,
    progress=False,
    auto_adjust=False,
)

if isinstance(ohlcv.columns, pd.MultiIndex):
    closes = ohlcv.xs("Close", axis=1, level=1)
else:
    closes = ohlcv[["Close"]].copy()
    if len(tickers) == 1:
        closes.columns = tickers

# Fast facts: sector / industry from Wikipedia table (no API calls)
meta = df_constituents.rename(
    columns={"Symbol": "symbol_wiki"}
)
meta["symbol"] = meta["symbol_wiki"].str.replace(".", "-", regex=False)

out_path = Path(__file__).resolve().parent / "sp500_close.csv"

closes.sort_index().to_csv(out_path, index_label="Date")

print("Constituent count:", len(tickers))
print("\nWikipedia table (head):")
print(meta.head())
print("\nClose-only shape (days × tickers):", closes.shape)
print(closes.head())
print(f"\nWrote {out_path}")
