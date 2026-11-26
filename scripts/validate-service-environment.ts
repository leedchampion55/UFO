import "dotenv/config";
import { validateServiceEnvironment, type ServiceRole } from "@/lib/env";

const role = process.argv[2] as ServiceRole | undefined;
const allowed: ServiceRole[] = ["web", "email-worker", "email-maintenance", "rate-limit-maintenance", "media-maintenance", "media-backup", "migration", "database-backup"];
if (!role || !allowed.includes(role)) throw new Error("SERVICE_ROLE_REQUIRED");
validateServiceEnvironment(role);
