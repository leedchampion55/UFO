import "dotenv/config";
import { validateRuntimeEnvironment } from "@/lib/env";
import { reconcileMediaStorage } from "@/lib/media-lifecycle";
import { prisma } from "@/lib/prisma";

validateRuntimeEnvironment();
const apply = process.argv.includes("--apply");
const result = await reconcileMediaStorage({ dryRun: !apply });
console.log(JSON.stringify(result, null, 2));
await prisma.$disconnect();
