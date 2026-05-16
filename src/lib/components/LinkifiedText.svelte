<script lang="ts">
	interface Props {
		text: string;
	}

	type TextPart =
		| { kind: 'text'; value: string }
		| { kind: 'link'; value: string; href: string };

	let { text }: Props = $props();

	const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
	const TRAILING_PUNCTUATION = '.,!?;:)]}';

	function splitTrailingPunctuation(value: string) {
		let link = value;
		let trailing = '';

		while (link.length > 0 && TRAILING_PUNCTUATION.includes(link.at(-1) ?? '')) {
			trailing = `${link.at(-1)}${trailing}`;
			link = link.slice(0, -1);
		}

		return { link, trailing };
	}

	function toHref(value: string) {
		return value.startsWith('www.') ? `https://${value}` : value;
	}

	function linkify(value: string): TextPart[] {
		const parts: TextPart[] = [];
		let lastIndex = 0;

		for (const match of value.matchAll(URL_PATTERN)) {
			const raw = match[0];
			const index = match.index ?? 0;
			if (index > lastIndex) {
				parts.push({ kind: 'text', value: value.slice(lastIndex, index) });
			}

			const { link, trailing } = splitTrailingPunctuation(raw);
			if (link) parts.push({ kind: 'link', value: link, href: toHref(link) });
			if (trailing) parts.push({ kind: 'text', value: trailing });
			lastIndex = index + raw.length;
		}

		if (lastIndex < value.length) {
			parts.push({ kind: 'text', value: value.slice(lastIndex) });
		}

		return parts;
	}

	const parts = $derived(linkify(text));
</script>

{#each parts as part}
	{#if part.kind === 'link'}
		<a class="auto-link" href={part.href} target="_blank" rel="noopener noreferrer">{part.value}</a>
	{:else}
		{part.value}
	{/if}
{/each}

<style>
	.auto-link {
		color: var(--accent);
		font-weight: 650;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
		word-break: break-word;
	}

	.auto-link:hover {
		color: var(--accent-2);
	}
</style>
