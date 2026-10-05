export function isUuid(v: string | null | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function logoUrl(r: { id: string; logoUpdatedAt: Date | null }) {
  return `/api/logo/${r.id}?v=${r.logoUpdatedAt?.getTime() ?? 0}`;
}
