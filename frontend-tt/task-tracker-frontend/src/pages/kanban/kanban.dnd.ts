export const dndIds = {
  card: (cardId: string) => `card:${cardId}`,
  column: (columnId: string) => `col:${columnId}`,
};

export function parseCardId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  return id.startsWith("card:") ? id.slice("card:".length) : null;
}

export function parseColumnId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  return id.startsWith("col:") ? id.slice("col:".length) : null;
}

