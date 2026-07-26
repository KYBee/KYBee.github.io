export interface ProjectEntryLike {
  id: string;
  data: {
    lang: 'ko' | 'en';
    order?: number;
    company: string;
    role: string;
    period: string;
    location?: string;
  };
}

export interface ProjectGroup<T extends ProjectEntryLike> {
  company: string;
  role: string;
  period: string;
  location?: string;
  items: T[];
}

export function compareEntryOrder(
  left: { data: { order?: number } },
  right: { data: { order?: number } },
): number {
  return (left.data.order ?? 0) - (right.data.order ?? 0);
}

export function groupProjectEntries<T extends ProjectEntryLike>(
  entries: readonly T[],
): ProjectGroup<T>[] {
  const groups: ProjectGroup<T>[] = [];
  const sortedEntries = [...entries].sort(compareEntryOrder);

  for (const entry of sortedEntries) {
    const lastGroup = groups[groups.length - 1];

    if (
      lastGroup &&
      lastGroup.company === entry.data.company &&
      lastGroup.role === entry.data.role &&
      lastGroup.period === entry.data.period
    ) {
      lastGroup.items.push(entry);
      continue;
    }

    groups.push({
      company: entry.data.company,
      role: entry.data.role,
      period: entry.data.period,
      location: entry.data.location,
      items: [entry],
    });
  }

  return groups;
}

export function getCurrentProjectEntries<T extends ProjectEntryLike>(
  entries: readonly T[],
): T[] {
  return groupProjectEntries(entries)[0]?.items ?? [];
}
