const tickerData = [
  { symbol: 'AAPL', price: '189.42', change: '+2.34%', up: true },
  { symbol: 'TSLA', price: '248.91', change: '+5.12%', up: true },
  { symbol: 'NVDA', price: '721.33', change: '-1.08%', up: false },
  { symbol: 'MSFT', price: '378.22', change: '+0.87%', up: true },
  { symbol: 'AMZN', price: '153.67', change: '-0.45%', up: false },
  { symbol: 'GOOG', price: '141.89', change: '+1.23%', up: true },
  { symbol: 'META', price: '367.12', change: '+3.45%', up: true },
  { symbol: 'JPM', price: '172.55', change: '-0.92%', up: false },
  { symbol: 'V', price: '278.33', change: '+0.56%', up: true },
  { symbol: 'DIS', price: '112.44', change: '+1.87%', up: true },
]

export function TickerBar() {
  const items = [...tickerData, ...tickerData]

  return (
    <div className="overflow-hidden border-b border-slate-800/80 bg-slate-900/40">
      <div className="animate-ticker-scroll flex w-max whitespace-nowrap py-2">
        {items.map((item, i) => (
          <div
            key={`${item.symbol}-${i}`}
            className="flex items-center gap-3 px-6 border-r border-slate-800/60 last:border-r-0"
          >
            <span className="font-mono text-xs font-semibold text-slate-100">{item.symbol}</span>
            <span className="font-mono text-xs text-slate-400">${item.price}</span>
            <span
              className={`font-mono text-xs font-medium ${
                item.up ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {item.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
