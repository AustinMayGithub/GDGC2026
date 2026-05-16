<script lang="ts">
	import type { SessionUser } from '$lib/types';

	let { user }: { user: SessionUser | null } = $props();

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}

	let open = $state(false);
</script>

{#if user}
	<div class="usermenu">
		<button class="avatar" onclick={() => (open = !open)} aria-label="Account menu">
			{initials(user.displayName)}
		</button>
		{#if open}
			<div class="dropdown card">
				<div class="who">
					<strong>{user.displayName}</strong>
					<span class="email">{user.email}</span>
				</div>
				<a class="menu-link" href="/profile/{user.id}" onclick={() => (open = false)}>
					My profile
				</a>
				<a class="menu-link" href="/profile/{user.id}#posts" onclick={() => (open = false)}>
					My posts
				</a>
				<form method="POST" action="/auth/logout">
					<button class="signout" type="submit">Sign out</button>
				</form>
			</div>
		{/if}
	</div>
{:else}
	<a class="btn signin" href="/auth/login">Sign in</a>
{/if}

<style>
	.usermenu {
		position: relative;
	}
	.avatar {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		border: none;
		background: var(--gradient);
		color: #fff;
		font-weight: 700;
		font-size: 13px;
	}
	.dropdown {
		position: absolute;
		right: 0;
		top: 46px;
		width: 220px;
		padding: 12px;
		box-shadow: var(--shadow);
		z-index: 50;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-bottom: 10px;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.email {
		font-size: 12px;
		color: var(--text-3);
	}
	.menu-link {
		display: block;
		padding: 8px;
		border-radius: var(--radius-sm);
		font-size: 14px;
		font-weight: 500;
		color: var(--text);
		margin-bottom: 6px;
	}
	.menu-link:hover {
		background: var(--surface-2);
	}
	.signout {
		width: 100%;
		padding: 8px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-weight: 600;
	}
	.signin {
		padding: 8px 16px;
	}
</style>
