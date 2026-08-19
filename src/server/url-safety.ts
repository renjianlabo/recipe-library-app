import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ApiError } from "./api-error";

export type HostLookup = (hostname: string) => Promise<string[]>;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function inIpv4Range(value: number, base: string, prefix: number): boolean {
  const baseValue = ipv4Number(base);
  if (baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(normalized) === 4) {
    const value = ipv4Number(normalized);
    if (value === null) return true;
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) => inIpv4Range(value, String(base), Number(prefix)));
  }

  if (isIP(normalized) === 6) {
    if (normalized.startsWith("::ffff:")) {
      return isPrivateOrReservedIp(normalized.slice("::ffff:".length));
    }
    return normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8:")
      || normalized.startsWith("64:ff9b::");
  }

  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return BLOCKED_HOSTS.has(normalized)
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized.endsWith(".internal")
    || normalized.endsWith(".lan")
    || (!normalized.includes(".") && isIP(normalized) === 0);
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const results = await nodeLookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

export async function assertSafePublicUrl(
  rawUrl: string,
  options: { lookup?: HostLookup; maxLength?: number } = {},
): Promise<URL> {
  const value = rawUrl.trim();
  if (!value || value.length > (options.maxLength ?? 2_048)) {
    throw new ApiError("URL_INVALID", "URLが正しくありません。", 400, true);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("URL_INVALID", "URLが正しくありません。", 400, true);
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ApiError("URL_UNSAFE", "このURLは安全に読み込めません。", 400, false);
  }
  if ((url.protocol === "http:" && url.port && url.port !== "80")
    || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new ApiError("URL_UNSAFE", "標準以外のポートを使うURLは読み込めません。", 400, false);
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname) || (isIP(hostname) > 0 && isPrivateOrReservedIp(hostname))) {
    throw new ApiError(
      "URL_UNSAFE",
      "localhostやプライベートネットワークのURLは読み込めません。",
      400,
      false,
    );
  }

  if (isIP(hostname) === 0) {
    let addresses: string[];
    try {
      addresses = await (options.lookup ?? defaultLookup)(hostname);
    } catch {
      throw new ApiError(
        "URL_UNREACHABLE",
        "URLの接続先を確認できませんでした。URLを見直してください。",
        400,
        true,
      );
    }
    if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
      throw new ApiError(
        "URL_UNSAFE",
        "プライベートネットワークへ接続するURLは読み込めません。",
        400,
        false,
      );
    }
  }

  url.hash = "";
  return url;
}
