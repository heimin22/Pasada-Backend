export type AllowedSchema = Record<string, string[]>;

let cached: AllowedSchema | null = null;

export function loadAllowedSchemaFromEnv(envVar: string = 'SUPABASE_ALLOWED_SCHEMA'): AllowedSchema {
	if (cached) return cached;
	const raw = process.env[envVar];
	if (!raw) {
		cached = {};
		return cached;
	}
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') {
			cached = parsed as AllowedSchema;
			return cached;
		}
	} catch (e) {
		console.warn('Failed to parse allowed schema JSON from env:', e);
	}
	cached = {};
	return cached;
}

export function getAllowedColumns(table: string): string[] {
	const schema = loadAllowedSchemaFromEnv();
	return schema[table] || [];
}
