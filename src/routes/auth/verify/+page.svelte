<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Verify · BirdsEye</title></svelte:head>

<h1>Check your email</h1>
<p class="muted sub">
	We sent a 6-digit code to <strong>{data.email}</strong>. Enter it below to
	{data.purpose === 'signup' ? 'verify your account' : 'finish signing in'}.
</p>

<form
	method="POST"
	action="?/verify"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	<input
		class="input code"
		name="code"
		inputmode="numeric"
		autocomplete="one-time-code"
		maxlength="6"
		placeholder="000000"
		required
	/>

	{#if form?.error}
		<p class="error-text">{form.error}</p>
	{/if}
	{#if form?.resent}
		<p class="ok-text">A fresh code is on its way.</p>
	{/if}
	{#if form?.devOtp || data.devOtp}
		<p class="dev-code">
			Dev OTP: <strong>{form?.devOtp ?? data.devOtp}</strong>
		</p>
	{/if}

	<button class="btn btn-primary" type="submit" disabled={submitting}>
		{submitting ? 'Verifying…' : 'Verify'}
	</button>
</form>

<form method="POST" action="?/resend" use:enhance class="resend">
	<button class="linkbtn" type="submit">Didn't get it? Resend code</button>
</form>

<p class="hint">
	Dev mode: if no email service is configured, the code appears above and is also printed to the
	server console.
</p>

<style>
	.sub {
		margin: 6px 0 20px;
		font-size: 14px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.code {
		text-align: center;
		font-size: 28px;
		letter-spacing: 0.4em;
		font-weight: 700;
		padding: 14px;
	}
	.ok-text {
		color: var(--verify);
		font-size: 13px;
		margin: 0;
	}
	.resend {
		margin-top: 14px;
	}
	.dev-code {
		margin: 0;
		font-size: 13px;
		background: #fff6cc;
		border: 1px solid #f3de88;
		border-radius: 10px;
		padding: 10px 12px;
	}
	.linkbtn {
		background: none;
		border: none;
		color: var(--accent);
		font-weight: 600;
		font-size: 13px;
		padding: 0;
	}
	.hint {
		margin-top: 18px;
		font-size: 12px;
		color: var(--text-3);
	}
</style>
