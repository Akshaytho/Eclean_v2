// All amounts are integer paise (cents). Never floats.
// formatMoney(6000) → '₹60'
// formatMoney(6050) → '₹60.50'

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
}

export function formatMoney(amountCents: number, currency = 'INR'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  const rupees = amountCents / 100
  // Show decimals only if non-zero
  const formatted = rupees % 1 === 0
    ? rupees.toFixed(0)
    : rupees.toFixed(2)
  return `${symbol}${formatted}`
}
