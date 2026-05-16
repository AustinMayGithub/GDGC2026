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
	<a class="btn header-action-btn" href="/auth/login" onclick={handleLoginClick}>Sign in</a>
{/if}

<style>
	.usermenu {
		position: relative;
	}
	.avatar {
		width: 56px;
		height: 56px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.72);
		background: var(--gradient);
		color: #fff;
		font-weight: 700;
		font-size: 13px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
		transition: transform 0.16s ease, box-shadow 0.16s ease;
	}
	.avatar:hover {
		box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
	}
	.avatar:active {
		transform: translateY(1px);
	}
	.notification-dot {
		position: absolute;
		top: 5px;
		right: 5px;
		width: 10px;
		height: 10px;
		border: 2px solid var(--surface);
		border-radius: 50%;
		background: #dc2626;
		box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.2);
	}
</style>
