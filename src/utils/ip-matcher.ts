import { isIP } from 'node:net';

/** Strips IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 → 192.168.1.1). */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function ipv4InCidr(ip: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

function expandIpv6(ip: string): bigint {
  const halves = ip.split('::');
  if (halves.length > 2) {
    return 0n;
  }

  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const tail = halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = 8 - head.length - tail.length;
  const groups = [...head, ...Array(Math.max(0, missing)).fill('0'), ...tail];

  return groups.reduce((acc, group) => (acc << 16n) + BigInt(parseInt(group || '0', 16)), 0n);
}

function ipv6InCidr(ip: string, network: string, prefix: number): boolean {
  const ipValue = expandIpv6(ip);
  const networkValue = expandIpv6(network);
  if (prefix === 0) {
    return true;
  }
  const shift = BigInt(128 - prefix);
  return ipValue >> shift === networkValue >> shift;
}

/** Validates a single IP address or CIDR notation (IPv4 or IPv6). */
export function isValidIpOrCidr(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (!trimmed.includes('/')) {
    return isIP(trimmed) !== 0;
  }

  const [network, prefixStr] = trimmed.split('/');
  if (!network || !prefixStr || !/^\d+$/.test(prefixStr)) {
    return false;
  }

  const prefix = Number(prefixStr);
  const version = isIP(network);
  if (version === 4) {
    return prefix >= 0 && prefix <= 32;
  }
  if (version === 6) {
    return prefix >= 0 && prefix <= 128;
  }
  return false;
}

/** Normalizes CIDR for storage (lowercase IPv6, trimmed). */
export function normalizeCidr(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.includes('/')) {
    return normalizeIp(trimmed);
  }
  const [network, prefix] = trimmed.split('/');
  return `${normalizeIp(network!)}/${prefix}`;
}

/** Returns true when `ip` matches any rule (exact IP or CIDR range). */
export function isIpAllowed(ip: string, rules: string[]): boolean {
  const normalized = normalizeIp(ip);
  if (!rules.length) {
    return false;
  }

  for (const rule of rules) {
    const trimmed = rule.trim();
    if (!trimmed) {
      continue;
    }

    if (!trimmed.includes('/')) {
      if (normalizeIp(trimmed) === normalized) {
        return true;
      }
      continue;
    }

    const [network, prefixStr] = trimmed.split('/');
    const prefix = Number(prefixStr);
    const networkNorm = normalizeIp(network!);
    const version = isIP(networkNorm);

    if (version === 4 && isIP(normalized) === 4) {
      if (ipv4InCidr(normalized, networkNorm, prefix)) {
        return true;
      }
    } else if (version === 6 && isIP(normalized) === 6) {
      if (ipv6InCidr(normalized, networkNorm, prefix)) {
        return true;
      }
    }
  }

  return false;
}
