let activeAlerts = JSON.parse(localStorage.getItem('meusAlertas')) || [];
let soundUnlocked = false;
let chartInstances = {}; 

window.onload = () => {
    if (activeAlerts.length > 0) renderTickers();
};

function saveAlerts() {
    localStorage.setItem('meusAlertas', JSON.stringify(activeAlerts));
}

const formatMoney = (val) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cascata de Ícones (Tratamento de fallback visual)
window.handleImageError = function(img, symbol, domain) {
    const cleanSymbol = symbol.replace('-', '');
    
    if (!img.dataset.retry) {
        img.dataset.retry = "1";
        img.src = `https://companiesmarketcap.com/img/company-logos/64/${cleanSymbol}.webp`;
    } else if (img.dataset.retry === "1" && domain && domain !== 'N/A' && domain !== '') {
        img.dataset.retry = "2";
        img.src = `https://logo.clearbit.com/${domain}`;
    } else if (img.dataset.retry !== "3") {
        img.dataset.retry = "3";
        img.src = `https://ui-avatars.com/api/?name=${symbol}&background=333333&color=ffffff&rounded=true&bold=true&font-size=0.35`;
    }
};

async function addTicker() {
    if (!soundUnlocked) {
        const audio = document.getElementById('alertSound');
        audio.volume = 0; 
        audio.play().then(() => {
            audio.pause(); audio.currentTime = 0; audio.volume = 1; soundUnlocked = true;
        }).catch(e => console.log("Áudio pendente"));
    }

    const symbol = document.getElementById('tickerInput').value.trim().toUpperCase();
    const condition = document.getElementById('conditionSelect').value;
    const targetPrice = parseFloat(document.getElementById('targetPrice').value);

    if (!symbol || isNaN(targetPrice)) {
        alert("Preencha o Ticker e o Valor Alvo.");
        return;
    }

    const btn = document.querySelector('button');
    btn.innerText = "Buscando...";

    try {
        const response = await fetch(`/api/ticker/${symbol}`);
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            btn.innerText = "Adicionar Alerta";
            return;
        }

        const alertItem = {
            id: Date.now(),
            symbol: data.symbol,
            domain: data.domain,
            currentPrice: data.price,
            changePercent: data.change_percent,
            condition: condition,
            targetPrice: targetPrice,
            triggered: false,
            triggerDate: null,
            triggerPrice: null,
            history: data.history,
            dates: data.dates,
            low_52w: data.low_52w,
            high_52w: data.high_52w,
            pe_ratio: data.pe_ratio,
            graham: data.graham,
            // Armazena a nova chave sugerida na revisão (com fallback para a antiga)
            analyst_target_mean: data.analyst_target_mean || data.fair_value,
            div_rate: data.div_rate,
            div_date: data.div_date
        };

        activeAlerts.push(alertItem);
        saveAlerts();
        renderTickers();
    } catch (erro) {
        alert("Erro de comunicação com o servidor Python.");
    }

    btn.innerText = "Adicionar Alerta";
    document.getElementById('tickerInput').value = '';
    document.getElementById('targetPrice').value = '';
}

function removeTicker(id) {
    activeAlerts = activeAlerts.filter(alert => alert.id !== id);
    saveAlerts();
    renderTickers();
}

function renderTickers() {
    const list = document.getElementById('tickersList');
    
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    list.innerHTML = '';

    activeAlerts.forEach(alert => {
        const cleanSymbol = alert.symbol.replace('-', '');
        const primaryIconUrl = `https://financialmodelingprep.com/image-stock/${cleanSymbol}.png`;
        const fallbackIcon = `https://ui-avatars.com/api/?name=${alert.symbol}&background=333333&color=ffffff&rounded=true&bold=true&font-size=0.35`;

        const card = document.createElement('div');
        card.id = `card-${alert.id}`; 
        card.className = `ticker-card ${alert.triggered ? 'triggered' : ''}`;
        
        let triggerHtml = '';
        if (alert.triggered) {
            if (alert.triggerDate) {
                triggerHtml = `<div class="trigger-history"><strong>ALVO ALCANÇADO</strong>Data: ${alert.triggerDate}<br>Valor hit: $ ${alert.triggerPrice}</div>`;
            } else {
                triggerHtml = `<div class="trigger-msg">VALOR ALCANÇADO COMPRA</div>`;
            }
        }

        // NOVIDADE: Tratamento seguro para Variação Diária (evita falha por null)
        let changeHtml = '';
        if (alert.changePercent === null || alert.changePercent === undefined || alert.changePercent === 'N/A') {
            changeHtml = `<span class="pct-change" style="background-color: rgba(255,255,255,0.1); color: var(--text-muted);">N/D</span>`;
        } else {
            let changeClass = alert.changePercent >= 0 ? 'pct-up' : 'pct-down';
            let changeSign = alert.changePercent > 0 ? '+' : '';
            changeHtml = `<span class="pct-change ${changeClass}">${changeSign}${alert.changePercent.toFixed(2)}%</span>`;
        }

        // Formatação segura de métricas (Tratamento N/A)
        let grahamStr = (alert.graham && alert.graham !== 'N/A') ? `$${formatMoney(alert.graham)}` : 'N/A';
        let targetMean = alert.analyst_target_mean || alert.fair_value;
        let fairValueStr = (targetMean && targetMean !== 'N/A') ? `$${formatMoney(targetMean)}` : 'N/A';
        let peStr = (alert.pe_ratio && alert.pe_ratio !== 'N/A') ? alert.pe_ratio : 'N/A';
        let low52Str = (alert.low_52w && alert.low_52w !== 'N/A') ? formatMoney(alert.low_52w) : 'N/D';
        let high52Str = (alert.high_52w && alert.high_52w !== 'N/A') ? formatMoney(alert.high_52w) : 'N/D';
        
        let divHtml = '';
        if (alert.div_rate && alert.div_rate !== 'N/A') {
            divHtml = `<div class="metric-item">Próx Div: <span>$${alert.div_rate} <small>(${alert.div_date})</small></span></div>`;
        } else {
            divHtml = `<div class="metric-item">Próx Div: <span>N/A</span></div>`;
        }

        card.innerHTML = `
            <div class="ticker-header">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${primaryIconUrl}" alt="logo" class="ticker-icon" onerror="handleImageError(this, '${alert.symbol}', '${alert.domain}')">
                    <strong>${alert.symbol}</strong>
                </div>
                <button class="btn-remove" onclick="removeTicker(${alert.id})">X</button>
            </div>
            
            <div class="ticker-body">
                <div class="price-row">
                    <span class="price">$ ${formatMoney(alert.currentPrice)}</span>
                    ${changeHtml}
                </div>
                
                <div class="metrics-grid">
                    <div class="metric-item">Graham: <span>${grahamStr}</span></div>
                    <div class="metric-item">Preço-alvo médio: <span style="color: var(--success-color);">${fairValueStr}</span></div>
                    <div class="metric-item">P/L (12m): <span>${peStr}</span></div>
                    <div class="metric-item">52W Range: <span>$${low52Str} - $${high52Str}</span></div>
                    ${divHtml}
                </div>

                <p class="alert-info">Alerta configurado para: ${alert.condition === 'maior' ? '>' : '<'} $ ${formatMoney(alert.targetPrice)}</p>
                ${triggerHtml}
                <div class="chart-container">
                    <canvas id="chart-${alert.id}"></canvas>
                </div>
            </div>
        `;
        list.appendChild(card);

        let chartColor = '#bb86fc'; 
        if (alert.history && alert.history.length > 1) {
            const startPrice = alert.history[0];
            const endPrice = alert.history[alert.history.length - 1];
            chartColor = endPrice >= startPrice ? '#03dac6' : '#cf6679'; 
        }

        if (alert.history && alert.history.length > 0 && alert.dates && alert.dates.length > 0) {
            const ctx = document.getElementById(`chart-${alert.id}`).getContext('2d');
            chartInstances[alert.id] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: alert.dates,
                    datasets: [{
                        data: alert.history,
                        borderColor: chartColor,
                        backgroundColor: chartColor + '22',
                        borderWidth: 2,
                        pointRadius: 2,
                        fill: true,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: true } },
                    scales: { 
                        x: { display: true, ticks: { color: '#888', maxTicksLimit: 5 } }, 
                        y: { display: true, ticks: { color: '#888' } } 
                    }
                }
            });
        }
    });
}

// Rota de consumo leve (atualiza apenas a cotação a cada 30 segundos)
async function updatePricesBackground() {
    let hasChanges = false;
    for (let alertItem of activeAlerts) {
        if (alertItem.triggered) continue; 

        try {
            const response = await fetch(`/api/price/${alertItem.symbol}`);
            const data = await response.json();

            if (!data.error) {
                alertItem.currentPrice = data.price;
                
                if (alertItem.condition === 'maior' && alertItem.currentPrice >= alertItem.targetPrice) {
                    triggerAlert(alertItem, alertItem.currentPrice);
                } else if (alertItem.condition === 'menor' && alertItem.currentPrice <= alertItem.targetPrice) {
                    triggerAlert(alertItem, alertItem.currentPrice);
                }
                hasChanges = true;
            }
        } catch (erro) {}
    }
    
    if (hasChanges) {
        saveAlerts();
        updateDOMPricesOnly();
    }
}

function updateDOMPricesOnly() {
    activeAlerts.forEach(alertItem => {
        const card = document.getElementById(`card-${alertItem.id}`);
        if (card) {
            const priceEl = card.querySelector('.price');
            if (priceEl) priceEl.innerText = `$ ${formatMoney(alertItem.currentPrice)}`;
            
            if (alertItem.triggered && !card.classList.contains('triggered')) {
                card.classList.add('triggered');
                
                if (!card.querySelector('.trigger-history')) {
                    const historyDiv = document.createElement('div');
                    historyDiv.className = 'trigger-history';
                    historyDiv.innerHTML = `<strong>ALVO ALCANÇADO</strong>Data: ${alertItem.triggerDate}<br>Valor hit: $ ${alertItem.triggerPrice}`;
                    card.querySelector('.ticker-body').insertBefore(historyDiv, card.querySelector('.chart-container'));
                }
            }
        }
    });
}

setInterval(updatePricesBackground, 30000); 

function triggerAlert(alertItem, priceHit) {
    alertItem.triggered = true;
    alertItem.triggerPrice = formatMoney(priceHit);
    
    const now = new Date();
    alertItem.triggerDate = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');
    
    const audio = document.getElementById('alertSound');
    audio.currentTime = 0;
    audio.play().catch(() => console.log("Áudio bloqueado pelo navegador."));
}