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

	let avatarFailed = $state(false);

	$effect(() => {
		user?.id;
		user?.hasAvatar;
		avatarFailed = false;
	});

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
			{#if user.hasAvatar && !avatarFailed}
				<img
					class="avatar-img"
					src="/api/users/{user.id}/avatar"
					alt=""
					onerror={() => (avatarFailed = true)}
				/>
			{:else}
				{initials(user.displayName)}
			{/if}
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
		overflow: hidden;
	}
	.avatar-img {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
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
</style>
