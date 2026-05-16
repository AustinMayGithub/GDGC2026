export function timeAgo(isoString: string): string {
	const timestamp = new Date(isoString).getTime();
	if (!Number.isFinite(timestamp)) return 'recently';

	const diffMs = Math.abs(Date.now() - timestamp);
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	return `${Math.floor(hours / 24)}d ago`;
}
