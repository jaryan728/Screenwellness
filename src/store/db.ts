import Database from "@tauri-apps/plugin-sql";

let instance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!instance) {
    instance = await Database.load("sqlite:screenwellness.db");
  }
  return instance;
}
