from datetime import datetime, timezone
import logging
import math
import re
from urllib.parse import urlparse

from flask import Flask, jsonify, render_template
import yfinance as yf

app = Flask(__name__)
app.logger.setLevel(logging.INFO)

SYMBOL_PATTERN = re.compile(r"^[A-Z0-9.^=_-]{1,30}$")

def normalize_symbol(symbol):
    normalized = (symbol or "").strip().upper()
    return normalized if SYMBOL_PATTERN.fullmatch(normalized) else None

def to_float(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError, OverflowError):
        return None

def rounded_or_na(value, decimals=2):
    number = to_float(value)
    return round(number, decimals) if number is not None else "N/A"

def fast_info_number(ticker, key):
    try:
        return to_float(ticker.fast_info.get(key))
    except Exception:
        return None

def get_current_price(ticker, history=None):
    price = fast_info_number(ticker, "last_price")
    if price is not None and price > 0:
        return price

    try:
        hist = history
        if hist is None:
            hist = ticker.history(period="5d", interval="1d", auto_adjust=False, timeout=10)

        if hist is None or hist.empty or "Close" not in hist.columns:
            return None

        closes = hist["Close"].dropna()
        if closes.empty:
            return None

        fallback_price = to_float(closes.iloc[-1])
        if fallback_price is not None and fallback_price > 0:
            return fallback_price

        return None
    except Exception:
        return None

def get_domain(symbol, info):
    if symbol == "BTC-USD":
        return "bitcoin.org"
    if symbol == "BRL=X":
        return "bcb.gov.br"

    website = str(info.get("website") or "").strip()
    if not website:
        return ""

    parsed = urlparse(website if "://" in website else f"https://{website}")
    hostname = parsed.hostname or ""

    if hostname.lower().startswith("www."):
        hostname = hostname[4:]

    return hostname.lower()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/ticker/<symbol>")
def get_ticker_info(symbol):
    symbol_upper = normalize_symbol(symbol)
    if not symbol_upper:
        return jsonify({"error": "Símbolo inválido"}), 400

    try:
        ticker = yf.Ticker(symbol_upper)
        hist = ticker.history(period="1mo", interval="1d", auto_adjust=False, timeout=10)

        if hist is None or hist.empty or "Close" not in hist.columns:
            return jsonify({"error": "Nenhum histórico encontrado para esse símbolo"}), 404

        hist = hist.dropna(subset=["Close"])
        if hist.empty:
            return jsonify({"error": "Nenhum preço válido encontrado para esse símbolo"}), 404

        try:
            info = ticker.info or {}
        except Exception:
            info = {}

        current_price = get_current_price(ticker, history=hist)
        if current_price is None:
            return jsonify({"error": "Não foi possível obter uma cotação válida"}), 502

        previous_close = fast_info_number(ticker, "previous_close")
        if previous_close is None or previous_close <= 0:
            closes = hist["Close"].dropna()
            previous_close = to_float(closes.iloc[-2]) if len(closes) > 1 else None

        if previous_close is not None and previous_close > 0:
            change_percent = round(((current_price - previous_close) / previous_close) * 100, 2)
        else:
            change_percent = None

        prices_history = [round(float(price), 2) for price in hist["Close"].tolist()]
        dates_history = [date.strftime("%d/%m") for date in hist.index]

        eps = to_float(info.get("trailingEps"))
        bvps = to_float(info.get("bookValue"))
        graham = "N/A"
        if eps is not None and bvps is not None and eps > 0 and bvps > 0:
            graham = round(math.sqrt(22.5 * eps * bvps), 2)

        analyst_target_mean = rounded_or_na(info.get("targetMeanPrice"))
        low_52w = rounded_or_na(info.get("fiftyTwoWeekLow"))
        high_52w = rounded_or_na(info.get("fiftyTwoWeekHigh"))
        pe_ratio = rounded_or_na(info.get("trailingPE"))

        dividend_rate_number = to_float(info.get("dividendRate"))
        div_rate = round(dividend_rate_number, 2) if dividend_rate_number is not None else "N/A"

        div_date = "N/A"
        div_timestamp = to_float(info.get("exDividendDate"))
        if div_timestamp is not None and div_timestamp > 0:
            try:
                div_date = datetime.fromtimestamp(div_timestamp, tz=timezone.utc).strftime("%d/%m/%Y")
            except (OverflowError, OSError, ValueError):
                pass

        return jsonify({
            "symbol": symbol_upper,
            "price": round(current_price, 4),
            "change_percent": change_percent,
            "domain": get_domain(symbol_upper, info),
            "currency": info.get("currency", "USD"),
            "history": prices_history,
            "dates": dates_history,
            "low_52w": low_52w,
            "high_52w": high_52w,
            "pe_ratio": pe_ratio,
            "graham": graham,
            "fair_value": analyst_target_mean,
            "analyst_target_mean": analyst_target_mean,
            "div_rate": div_rate,
            "div_date": div_date,
        })

    except Exception:
        app.logger.exception("Erro ao consultar o ticker %s", symbol_upper)
        return jsonify({"error": "Falha ao consultar os dados do mercado. Tente novamente."}), 502

@app.route("/api/price/<symbol>")
def get_price_only(symbol):
    symbol_upper = normalize_symbol(symbol)
    if not symbol_upper:
        return jsonify({"error": "Símbolo inválido"}), 400

    try:
        ticker = yf.Ticker(symbol_upper)
        price = get_current_price(ticker)

        if price is None:
            return jsonify({"error": "Não foi possível obter uma cotação válida"}), 502
            
        history = ticker.history(period="5d", interval="1d", auto_adjust=False, timeout=10)
        previous_close = to_float(ticker.fast_info.get("previous_close"))
        
        if previous_close is None or previous_close <= 0:
            closes = history["Close"].dropna() if not history.empty else []
            if len(closes) > 1:
                previous_close = to_float(closes.iloc[-2])
                
        change_percent = (
            round(((price - previous_close) / previous_close) * 100, 2)
            if previous_close is not None and previous_close > 0
            else None
        )

        return jsonify({
            "symbol": symbol_upper,
            "price": round(price, 4),
            "change_percent": change_percent,
            "currency": ticker.info.get("currency", "USD"),
        })

    except Exception:
        app.logger.exception("Erro ao consultar o preço de %s", symbol_upper)
        return jsonify({"error": "Falha ao consultar a cotação. Tente novamente."}), 502

if __name__ == "__main__":
    app.run(debug=False, port=5000)