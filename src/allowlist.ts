export function isEmailAllowed(
	email: string | undefined,
	verified: boolean | undefined,
	allowedCsv: string | undefined,
): boolean {
	if (!email || verified !== true) return false;
	const allowed = (allowedCsv ?? "")
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
	return allowed.includes(email.trim().toLowerCase());
}
