export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

export const COMMON_CURRENCIES: Currency[] = [
  { code: 'JPY', name: '日圓',   symbol: '¥'   },
  { code: 'TWD', name: '台幣',   symbol: '$'   },
  { code: 'KRW', name: '韓元',   symbol: '₩'   },
  { code: 'USD', name: '美元',   symbol: '$'   },
  { code: 'EUR', name: '歐元',   symbol: '€'   },
  { code: 'HKD', name: '港幣',   symbol: 'HK$' },
  { code: 'SGD', name: '新幣',   symbol: 'S$'  },
  { code: 'THB', name: '泰銖',   symbol: '฿'   },
  { code: 'CNY', name: '人民幣', symbol: '¥'   },
  { code: 'AUD', name: '澳幣',   symbol: 'A$'  },
  { code: 'GBP', name: '英鎊',   symbol: '£'   },
  { code: 'MYR', name: '馬來幣', symbol: 'RM'  },
  { code: 'VND', name: '越南盾', symbol: '₫'   },
  { code: 'PHP', name: '菲律賓披索', symbol: '₱' },
  { code: 'IDR', name: '印尼盾', symbol: 'Rp'  },
  { code: 'INR', name: '印度盧比', symbol: '₹'  },
  { code: 'CAD', name: '加拿大幣', symbol: 'C$' },
  { code: 'CHF', name: '瑞士法郎', symbol: 'Fr' },
];

export function searchCurrencies(query: string): Currency[] {
  if (!query.trim()) return COMMON_CURRENCIES;
  const q = query.toLowerCase();
  return COMMON_CURRENCIES.filter(
    c => c.code.toLowerCase().includes(q) || c.name.includes(q)
  );
}

export function getCurrencySymbol(code: string): string {
  return COMMON_CURRENCIES.find(c => c.code === code)?.symbol ?? code;
}
