<script lang="ts">
	import type { SessionUser } from '$lib/types';

	let {
		user,
		hasUnreadNotifications = false,
		onProfileSelect,
		onLoginSelect
	}: {
		user: SessionUser | null;
		hasUnreadNotifications?: boolean;
		onProfileSelect?: (id: string) => void;
		onLoginSelect?: () => void;
	} = $props();

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}

	function handleProfileClick(e: MouseEvent, id: string) {
		if (!onProfileSelect) return;
		e.preventDefault();
		onProfileSelect(id);
	}

	function handleLoginClick(e: MouseEvent) {
		if (!onLoginSelect) return;
		e.preventDefault();
		onLoginSelect();
	}
</script>

{#if user}
	<div class="usermenu">
		<a
			class="avatar"
			href="/profile/{user.id}#posts"
			aria-label="Open account panel"
			onclick={(e) => handleProfileClick(e, user.id)}
		>
			{initials(user.displayName)}
			{#if hasUnreadNotifications}
				<span class="notification-dot" aria-label="New comments"></span>
			{/if}
		</a>
	</div>
{:else}
	<a class="btn signin" href="/auth/login" onclick={handleLoginClick}>Sign in</a>
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
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}
	.notification-dot {
		position: absolute;
		top: 1px;
		right: 1px;
		width: 10px;
		height: 10px;
		border: 2px solid var(--surface);
		border-radius: 50%;
		background: #dc2626;
		box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.2);
	}
	.signin {
		padding: 8px 16px;
	}
</style>
