import { NextResponse } from 'next/server'

// ─── Binance P2P ─────────────────────────────────────────────────────────────
// Calls the same public endpoint used by the binance-bcv-dolar project
async function fetchBinanceP2P(): Promise<{ avg: number; median: number; prices: number[] } | null> {
  try {
    const body = {
      fiat: 'VES',
      page: 1,
      rows: 20,
      tradeType: 'BUY',
      asset: 'USDT',
      countries: [],
      proMerchantAds: false,
      shieldMerchantAds: false,
      filterType: 'tradable',
      periods: [],
      additionalKycVerifyFilter: 0,
      publisherType: null,
      payTypes: [],
      classifies: ['mass', 'profession', 'fiat_trade'],
      tradedWith: false,
      followed: false,
    }

    const res = await fetch(
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        next: { revalidate: 300 }, // cache 5 min
      }
    )

    const json = await res.json()

    if (
      json.code === '000000' &&
      Array.isArray(json.data) &&
      json.data.length > 0
    ) {
      const prices: number[] = json.data.map(
        (ad: { adv: { price: string } }) => parseFloat(ad.adv.price)
      )
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length
      const sorted = [...prices].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid]
      return {
        avg: Math.round(avg * 100) / 100,
        median: Math.round(median * 100) / 100,
        prices,
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── BCV — via ve.dolarapi.com (tasa oficial) ────────────────────────────────
// The API returns: [{ fuente: "oficial", promedio: 421.87 }, { fuente: "paralelo", ... }]
// "oficial" = BCV official rate, "paralelo" = parallel/black market rate
async function fetchBCV(): Promise<number | null> {
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares', {
      next: { revalidate: 3600 }, // BCV updates once a day
    })
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oficial = data.find((d: any) =>
        d.fuente === 'oficial' ||
        d.fuente === 'BCV' ||
        (d.nombre ?? '').toLowerCase().includes('oficial') ||
        (d.nombre ?? '').toLowerCase().includes('bcv')
      )
      if (oficial?.promedio) return Number(oficial.promedio)
    }
    return null
  } catch {
    return null
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET() {
  const [binanceResult, bcv] = await Promise.all([fetchBinanceP2P(), fetchBCV()])

  const binance = binanceResult?.avg ?? null
  const binanceMedian = binanceResult?.median ?? null
  const promedio =
    bcv !== null && binance !== null
      ? Math.round(((bcv + binance) / 2) * 100) / 100
      : null

  return NextResponse.json(
    {
      bcv,
      binance,
      binanceMedian,
      promedio,
      updatedAt: new Date().toISOString(),
      ok: true,
    },
    {
      headers: {
        // Also allow browser caching for 3 min
        'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
      },
    }
  )
}
