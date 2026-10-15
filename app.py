from flask import Flask, render_template, jsonify
import yfinance as yf
from datetime import datetime

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/ticker/<symbol>')
def get_ticker_info(symbol):
    try:
        symbol_upper = symbol.upper()
        ticker = yf.Ticker(symbol_upper)
        
        hist = ticker.history(period='1mo').dropna(subset=['Close'])
        if hist.empty:
            return jsonify({"error": "Ticker não encontrado"}), 404
            
        info = ticker.info
        
        try:
            current_price = float(ticker.fast_info.last_price)
        except:
            current_price = float(hist['Close'].iloc[-1])
            
        previous_close = float(hist['Close'].iloc[-2]) if len(hist) > 1 else current_price
        change_percent = ((current_price - previous_close) / previous_close) * 100
        
        prices_history = [round(float(price), 2) for price in hist['Close'].tolist()]
        dates_history = [d.strftime('%d/%m') for d in hist.index]
        
        domain = ""
        if symbol_upper == 'BTC-USD': domain = 'bitcoin.org'
        elif symbol_upper == 'BRL=X': domain = 'bcb.gov.br'
        else:
            website = info.get('website', '')
            if website:
                domain = website.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0]
            else:
                short_name = info.get('shortName', '')
                if short_name:
                    primeira_palavra = short_name.split()[0].lower().replace(',', '').replace('.', '')
                    domain = f"{primeira_palavra}.com"

        # LÓGICA DE GRAHAM
        eps = info.get('trailingEps')
        bvps = info.get('bookValue')
        graham = "N/A"
        if eps is not None and bvps is not None:
            if float(eps) > 0 and float(bvps) > 0:
                graham = round((22.5 * float(eps) * float(bvps)) ** 0.5, 2)

        # LÓGICA DO PREÇO JUSTO (Consenso FCD/Múltiplos dos Analistas)
        fair_value = info.get('targetMeanPrice', 'N/A')
        if fair_value != 'N/A' and fair_value is not None:
            fair_value = round(float(fair_value), 2)
        else:
            fair_value = 'N/A'

        low_52w = info.get('fiftyTwoWeekLow', 'N/A')
        high_52w = info.get('fiftyTwoWeekHigh', 'N/A')
        pe_ratio = info.get('trailingPE', 'N/A')

        if low_52w != 'N/A': low_52w = round(float(low_52w), 2)
        if high_52w != 'N/A': high_52w = round(float(high_52w), 2)
        if pe_ratio != 'N/A': pe_ratio = round(float(pe_ratio), 2)

        div_rate = info.get('dividendRate', 'N/A')
        div_date_raw = info.get('exDividendDate')
        div_date = 'N/A'
        if div_date_raw is not None and str(div_date_raw).isdigit():
            div_date = datetime.fromtimestamp(div_date_raw).strftime('%d/%m/%Y')

        return jsonify({
            "symbol": symbol_upper,
            "price": current_price,
            "change_percent": round(change_percent, 2),
            "domain": domain,
            "history": prices_history,
            "dates": dates_history,
            "low_52w": low_52w,
            "high_52w": high_52w,
            "pe_ratio": pe_ratio,
            "graham": graham,
            "fair_value": fair_value, # Enviando o Preço Justo para a tela
            "div_rate": div_rate,
            "div_date": div_date
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/price/<symbol>')
def get_price_only(symbol):
    try:
        ticker = yf.Ticker(symbol.upper())
        try:
            price = float(ticker.fast_info.last_price)
        except:
            price = float(ticker.history(period='1d')['Close'].iloc[-1])
        return jsonify({"price": price})
    except:
        return jsonify({"error": "Erro"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)