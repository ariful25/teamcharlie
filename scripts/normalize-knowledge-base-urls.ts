// One-time cleanup for PropertyKnowledgeItem rows created before Airbnb URL
// normalization existed (see lib/services/property-knowledge.ts). Two things
// can be true of old rows:
//   1. Their airbnbUrl still has tracking params (?source_impression_id=...)
//      instead of the canonical form new rows are stored with.
//   2. The same listing may have been imported twice under two different
//      tracking-param variants, which the old unique constraint didn't catch.
//
// This script is READ-ONLY by default — it only prints a plan. Nothing is
// written to the database unless you pass --apply. Always run it without
// --apply first and read the plan before applying it.
//
//   npx tsx scripts/normalize-knowledge-base-urls.ts            (dry run)
//   npx tsx scripts/normalize-knowledge-base-urls.ts --apply    (writes changes)

import { PrismaClient } from "@prisma/client";
import {
  computeCompletionPct,
  isFieldFilled,
  normalizeAirbnbUrl,
  OPTIONAL_KNOWLEDGE_FIELDS,
  REQUIRED_KNOWLEDGE_FIELDS,
} from "@/lib/services/property-knowledge";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const MERGEABLE_FIELDS = [...REQUIRED_KNOWLEDGE_FIELDS, ...OPTIONAL_KNOWLEDGE_FIELDS] as const;

function pickSurvivor<T extends { completionPct: number; updatedAt: Date; createdAt: Date }>(items: T[]): T {
  return [...items].sort((a, b) => {
    if (b.completionPct !== a.completionPct) return b.completionPct - a.completionPct;
    if (b.updatedAt.getTime() !== a.updatedAt.getTime()) return b.updatedAt.getTime() - a.updatedAt.getTime();
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

async function main() {
  const items = await prisma.propertyKnowledgeItem.findMany({
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  type Group = { normalizedUrl: string; listingId: string | null; items: typeof items };
  const groups = new Map<string, Group>();
  const unresolvable: typeof items = [];

  for (const item of items) {
    const normalized = normalizeAirbnbUrl(item.airbnbUrl);
    if (!normalized) {
      unresolvable.push(item);
      continue;
    }
    const key = `${item.clientId}::${normalized.url}`;
    const group = groups.get(key) ?? { normalizedUrl: normalized.url, listingId: normalized.listingId, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  let canonicalizeOnly = 0;
  let mergedDuplicates = 0;
  let deletedRows = 0;

  console.log(`Found ${items.length} property knowledge rows (${groups.size} distinct listings by client).`);
  if (unresolvable.length) {
    console.log(`\n⚠ ${unresolvable.length} row(s) have an airbnbUrl that no longer normalizes (not touched):`);
    for (const item of unresolvable) {
      console.log(`  - [${item.client.name}] ${item.internalName}: ${item.airbnbUrl}`);
    }
  }

  for (const group of groups.values()) {
    if (group.items.length === 1) {
      const item = group.items[0];
      if (item.airbnbUrl !== group.normalizedUrl || item.airbnbListingId !== group.listingId) {
        canonicalizeOnly++;
        console.log(`\nCanonicalize: [${item.client.name}] ${item.internalName}`);
        console.log(`  ${item.airbnbUrl}  ->  ${group.normalizedUrl}`);
        if (APPLY) {
          await prisma.propertyKnowledgeItem.update({
            where: { id: item.id },
            data: { airbnbUrl: group.normalizedUrl, airbnbListingId: group.listingId },
          });
        }
      }
      continue;
    }

    // Duplicate listings for the same client. Keep the most complete/most
    // recently touched row, non-destructively fill any gaps in it from the
    // other duplicates (never overwriting a value it already has), then
    // remove the redundant rows.
    mergedDuplicates++;
    const survivor = pickSurvivor(group.items);
    const others = group.items.filter((item) => item.id !== survivor.id);

    const patch: Record<string, unknown> = {};
    for (const field of MERGEABLE_FIELDS) {
      if (isFieldFilled((survivor as any)[field])) continue;
      const donor = others.find((item) => isFieldFilled((item as any)[field]));
      if (donor) patch[field] = (donor as any)[field];
    }

    console.log(`\nMerge duplicate listing: [${survivor.client.name}] ${group.normalizedUrl}`);
    console.log(`  Keeping:  ${survivor.internalName} (id ${survivor.id}, ${survivor.completionPct}% complete)`);
    for (const item of others) {
      console.log(`  Removing: ${item.internalName} (id ${item.id}, ${item.completionPct}% complete)`);
      deletedRows++;
    }
    if (Object.keys(patch).length > 0) {
      console.log(`  Filling gaps on survivor from duplicates: ${Object.keys(patch).join(", ")}`);
    }

    if (APPLY) {
      const merged = { ...survivor, ...patch };
      await prisma.propertyKnowledgeItem.update({
        where: { id: survivor.id },
        data: {
          ...patch,
          airbnbUrl: group.normalizedUrl,
          airbnbListingId: group.listingId,
          completionPct: computeCompletionPct(merged),
        },
      });
      await prisma.propertyKnowledgeItem.deleteMany({ where: { id: { in: others.map((item) => item.id) } } });
    }
  }

  console.log(
    `\n${APPLY ? "Applied" : "Would apply"}: ${canonicalizeOnly} URL canonicalized, ${mergedDuplicates} duplicate listing(s) merged, ${deletedRows} row(s) removed.`
  );
  if (!APPLY) {
    console.log("This was a dry run — nothing was written. Re-run with --apply to make these changes.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
