<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import HomeMap from '$lib/components/HomeMap.svelte';
	import HeadlineList from '$lib/components/HeadlineList.svelte';
	import ConnectorLines from '$lib/components/ConnectorLines.svelte';
	import TrendingDropdown from '$lib/components/TrendingDropdown.svelte';
	import CategoryPicker from '$lib/components/CategoryPicker.svelte';
	import HeaderImageCropper from '$lib/components/HeaderImageCropper.svelte';
	import PostImageGallery from '$lib/components/PostImageGallery.svelte';
	import LinkifiedText from '$lib/components/LinkifiedText.svelte';
	import CredibilityMeter from '$lib/components/CredibilityMeter.svelte';
	import CommunityNote from '$lib/components/CommunityNote.svelte';
	import ReactionBar from '$lib/components/ReactionBar.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import { fallbackAreaLabel } from '$lib/data/geo-labels';
	import { timeAgo } from '$lib/time';
	import type {
		SessionUser,
		PostSummary,
		PostCategory,
		PostDetail,
		CommentItem,
		CommunityNote as CommunityNoteData,
		UserProfile,
		VotePoint,
		VoteUser
	} from '$lib/types';
	import {
		NZ_BBOX,
		NZ_REGIONS,
		OUTSIDE_NZ_POST_MESSAGE,
		isWithinNzBounds,
		regionForPoint
	} from '$lib/data/nz-regions';
	import { getLocation, prewarm, seedCoarse, GeoError } from '$lib/location';
	import logo from '$lib/data/birdseye.png';

	interface PageData {
		user: SessionUser | null;
		coarseLocation: { lng: number; lat: number } | null;
		hasUnreadNotifications: boolean;
	}

	let { data }: { data: PageData } = $props();
	let hasUnreadNotifications = $state(false);

	type Scope = 'national' | 'region' | 'local';
	type TrendMode = 'new' | 'trending' | 'rising';
	type CachedRegion = {
		regionId: string;
		timestamp: number;
	};
	type MapViewportState = {
		centerLng: number;
		centerLat: number;
		zoom: number;
		bounds: [number, number, number, number];
	};
	type RankedPost = {
		post: PostSummary;
		score: number;
		engagement: number;
	};
	type AuthPanelMode = 'welcome' | 'login' | 'signup';

	const DEFAULT_REGION_ID = 'auckland';
	const REGION_CACHE_KEY = 'birdseye:local-region';
	const GEO_MAX_AGE_MS = 15 * 60 * 1000;
	const GEO_TIMEOUT_MS = 10_000;
	const LOCAL_FOCUS_RADIUS_KM = 0.9;
	const LOCAL_TRENDING_RADIUS_KM = 4;
	const LOCAL_AUTO_NATIONAL_ZOOM = 6.4;
	const LOCAL_AUTO_NATIONAL_GRACE_MS = 1400;
	const LOCAL_ZOOM_OUT_EPSILON = 0.05;
	const RADIUS_MIN_M = 100;
	const RADIUS_MAX_M = 50000;
	const RADIUS_SLIDER_MAX = 1000;
	const POST_REFRESH_INTERVAL_MS = 30_000;
	const POST_REFRESH_STALE_MS = 12_000;
	const orderedRegions = [
		...NZ_REGIONS.filter((region) => region.id === DEFAULT_REGION_ID),
		...NZ_REGIONS.filter((region) => region.id !== DEFAULT_REGION_ID)
	];

	$effect(() => {
		hasUnreadNotifications = data.hasUnreadNotifications;
	});

	let scope = $state<Scope>('national');
	let posts = $state<PostSummary[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hoveredPostId = $state<string | null>(null);
	let selectedPostId = $state<string | null>(null);
	let selectedPostDetail = $state<PostDetail | null>(null);
	let selectedPostComments = $state<CommentItem[]>([]);
	let selectedVotePoints = $state<VotePoint[]>([]);
	let selectedVoteUsers = $state<VoteUser[]>([]);
	let selectedPostTab = $state<'discussion' | 'voters'>('discussion');
	let selectedCommunityNote = $state<CommunityNoteData | null>(null);
	let selectedPostLoading = $state(false);
	let selectedPostError = $state('');
	let selectedPostRequestId = 0;
	let postDeleteError = $state('');
	let postDeleting = $state(false);

	let selectedRegionId = $state<string>(DEFAULT_REGION_ID);
	let localFocusLng = $state(174.76);
	let localFocusLat = $state(-36.85);
	let userLocation: { lng: number; lat: number } | null = $state(null);
	let geoError = $state<string | null>(null);
	let geoLoading = $state(false);

	let scrollHost: HTMLElement | null = null;
	let mapComponent: HomeMap | null = null;
	let mapReady = $state(false);
	let mapThreeD = $state(false);
	let redrawTrigger = $state(0);
	let mapViewport = $state<MapViewportState | null>(null);
	let listItemEls = new Map<string, HTMLElement>();
	let trendingItemEls = new Map<string, HTMLElement>();
	let activeFetchController: AbortController | null = null;
	let fetchRequestId = 0;
	let lastPostsFetchAt = 0;
	let postRefreshTimer: ReturnType<typeof setInterval> | null = null;
	let geoRequestId = 0;
	let composing = $state(false);
	let composeTitle = $state('');
	let composeBody = $state('');
	let composeHeaderImageDataUrl = $state<string | null>(null);
	let composeImageDataUrls = $state<string[]>([]);
	let composeCategory = $state<PostCategory | null>(null);
	let composeLng = $state(174.76);
	let composeLat = $state(-36.85);
	let composeRadiusM = $state(1000);
	let composeAnonymous = $state(false);
	let composeSubmitting = $state(false);
	let composeError = $state('');
	let composeAreaLabel = $state('Local Auckland area');
	let areaLabelRequestId = 0;
	let trendingOpen = $state(false);
	let trendMode = $state<TrendMode>('trending');
	let lastTrendingFitKey = '';
	let localAutoNationalEnabledAt = 0;
	let localPeakZoom: number | null = null;
	let composeRadiusFitFrame: number | null = null;
	let profileUserId = $state<string | null>(null);
	let profileDetail = $state<UserProfile | null>(null);
	let profileIsOwn = $state(false);
	let profileLoading = $state(false);
	let profileError = $state('');
	let profileRequestId = 0;
	let accountPanelOpen = $state(false);
	let profileEditing = $state(false);
	let profileSaving = $state(false);
	let profileSaveError = $state('');
	let profilePostDeletingId = $state<string | null>(null);
	let profilePostDeleteError = $state('');
	let profileDeleteAccountOpen = $state(false);
	let profileDeleteAccountPassword = $state('');
	let profileDeletingAccount = $state(false);
	let profileDeleteAccountError = $state('');
	let profileEditName = $state('');
	let profileEditBio = $state('');
	let profileEditAge = $state('');
	let profileEditLocation = $state('');
	let profileEditAvatarDataUrl = $state<string | null>(null);
	let profileAvatarVersion = $state(0);
	let authPanelMode = $state<AuthPanelMode>('welcome');
	let authEmail = $state('');
	let authPassword = $state('');
	let authDisplayName = $state('');
	let authSubmitting = $state(false);
	let authError = $state('');
	let authMessage = $state('');

	function toRadians(value: number) {
		return (value * Math.PI) / 180;
	}

	function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
		const earthRadiusKm = 6371;
		const latDelta = toRadians(bLat - aLat);
		const lngDelta = toRadians(bLng - aLng);
		const lat1 = toRadians(aLat);
		const lat2 = toRadians(bLat);
		const sinLat = Math.sin(latDelta / 2);
		const sinLng = Math.sin(lngDelta / 2);
		const haversine =
			sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
		return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
	}

	function regionCenter(regionId: string): [number, number] {
		return NZ_REGIONS.find((region) => region.id === regionId)?.center ?? [174.76, -36.85];
	}

	function setLocalFocus(lng: number, lat: number) {
		localFocusLng = lng;
		localFocusLat = lat;
	}

	function pauseLocalAutoNational() {
		localAutoNationalEnabledAt = Date.now() + LOCAL_AUTO_NATIONAL_GRACE_MS;
		localPeakZoom = null;
	}

	function applyUserLocation(lng: number, lat: number, focusMap: boolean) {
		const regionId = regionForPoint(lng, lat);
		userLocation = { lng, lat };
		selectedRegionId = regionId;
		writeCachedRegion(regionId);
		setLocalFocus(lng, lat);
		if (composing && data.user) {
			composeLng = lng;
			composeLat = lat;
		}

		if (focusMap && scope === 'local') {
			pauseLocalAutoNational();
			if (composing) {
				focusComposeLocation(lng, lat);
			} else {
				mapComponent?.focusOnLocation(lng, lat, LOCAL_FOCUS_RADIUS_KM);
			}
		}
	}

	function requestUserLocation(focusMap = false) {
		geoLoading = true;
		geoError = null;
		const requestId = ++geoRequestId;

		// The shared service keeps the location provider warm, so this resolves
		// instantly once the first fix is in — no per-call cold start.
		getLocation({ maxAgeMs: GEO_MAX_AGE_MS, timeoutMs: GEO_TIMEOUT_MS })
			.then((fix) => {
				if (requestId !== geoRequestId) return;
				geoLoading = false;
				geoError = null;
				applyUserLocation(fix.lng, fix.lat, focusMap);
			})
			.catch((err) => {
				if (requestId !== geoRequestId) return;
				geoLoading = false;
				geoError =
					err instanceof GeoError && err.kind === 'denied'
						? 'Using your selected region below.'
						: 'Using a saved region for now.';

				if (focusMap && scope === 'local') {
					const [fallbackLng, fallbackLat] = regionCenter(selectedRegionId);
					setLocalFocus(fallbackLng, fallbackLat);
					pauseLocalAutoNational();
					if (composing) {
						focusComposeLocation(fallbackLng, fallbackLat);
					} else {
						mapComponent?.focusOnLocation(fallbackLng, fallbackLat, LOCAL_FOCUS_RADIUS_KM);
					}
				}
			});
	}

	function readCachedRegion(): string | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = localStorage.getItem(REGION_CACHE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as CachedRegion;
			return NZ_REGIONS.some((region) => region.id === parsed.regionId) ? parsed.regionId : null;
		} catch {
			return null;
		}
	}

	function writeCachedRegion(regionId: string) {
		if (typeof localStorage === 'undefined') return;
		try {
			const payload: CachedRegion = { regionId, timestamp: Date.now() };
			localStorage.setItem(REGION_CACHE_KEY, JSON.stringify(payload));
		} catch {
			// Ignore storage failures and keep the UI moving.
		}
	}

	function popularityScore(post: PostSummary): number {
		const ageHours = ageHoursFor(post);
		const voteTotal = post.verifyCount + post.disputeCount;
		const approval = voteTotal === 0 ? 0.5 : post.verifyCount / voteTotal;
		const engagement =
			post.commentCount * 5 +
			post.reactionCount * 3 +
			post.verifyCount * 2 +
			post.disputeCount;
		const freshnessBoost = 18 / (ageHours + 6);
		return engagement * (0.7 + approval * 0.6) + freshnessBoost;
	}

	function engagementFor(post: PostSummary): number {
		const votes = post.verifyCount + post.disputeCount;
		return post.commentCount * 4 + post.reactionCount * 3 + votes * 2;
	}

	function ageHoursFor(post: PostSummary): number {
		const timestamp = new Date(post.createdAt).getTime();
		if (!Number.isFinite(timestamp)) return 0;
		return Math.max((Date.now() - timestamp) / 36e5, 0);
	}

	function trendScore(post: PostSummary): number {
		const engagement = engagementFor(post);
		const voteTotal = post.verifyCount + post.disputeCount;
		const conversation = post.commentCount * 5 + post.reactionCount * 2 + voteTotal * 2;
		const credibilitySignal = post.category === 'factual' ? Math.min(voteTotal, 12) * 1.5 : 0;
		const ageHours = ageHoursFor(post);
		const ageDecay = 1 / Math.pow(ageHours + 12, 0.35);
		return Math.round((engagement * 8 + conversation + credibilitySignal) * ageDecay * 100);
	}

	function risingScore(post: PostSummary): number {
		const engagement = engagementFor(post);
		const ageHours = ageHoursFor(post);
		if (ageHours > 72) return 0;
		const velocity = engagement / Math.max(ageHours + 0.75, 0.75);
		const freshness = Math.max(0, 72 - ageHours) / 72;
		const earlyBoost = post.commentCount > 0 || post.reactionCount > 0 ? 8 : 0;
		return Math.round((velocity * 120 + freshness * 35 + earlyBoost) * 100);
	}

	const rankedPosts = $derived.by(() => {
		return [...posts].sort((a, b) => {
			const diff = popularityScore(b) - popularityScore(a);
			if (Math.abs(diff) > 0.001) return diff;
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		});
	});

	const visiblePosts = $derived(rankedPosts);
	const trendingSource = $derived(
		scope === 'local'
			? visiblePosts.filter(
					(post) =>
						distanceKm(localFocusLat, localFocusLng, post.lat, post.lng) <=
						LOCAL_TRENDING_RADIUS_KM
				)
			: scope === 'region'
				? visiblePosts.filter((post) => post.regionId === selectedRegionId)
				: visiblePosts
	);
	const trendingEntries = $derived.by(() => {
		if (trendMode === 'new') {
			return trendingSource
				.map((post) => ({
					post,
					score: new Date(post.createdAt).getTime(),
					engagement: engagementFor(post)
				}))
				.sort((a, b) => b.score - a.score)
				.slice(0, 6);
		}

		const modeSource =
			trendMode === 'rising'
				? [...trendingSource].filter((post) => engagementFor(post) > 0)
				: [...trendingSource];
		const entries: RankedPost[] = modeSource
			.map((post) => ({
				post,
				score: trendMode === 'rising' ? risingScore(post) : trendScore(post),
				engagement: engagementFor(post)
			}))
			.filter((entry) => entry.engagement > 0 && entry.score > 0)
			.sort((a, b) => {
				const scoreDiff = b.score - a.score;
				if (scoreDiff !== 0) return scoreDiff;
				if (trendMode === 'rising') {
					return new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime();
				}
				return b.engagement - a.engagement;
			});

		return entries.slice(0, 6);
	});
	const trendingPosts = $derived(trendingEntries.map((entry) => entry.post));
	const selectedPosts = $derived(
		!trendingOpen && selectedPostId
			? visiblePosts.filter((post) => post.id === selectedPostId)
			: []
	);
	const mapUserLocation = $derived(userLocation ?? data.coarseLocation);
	const canEditComposeLocation = $derived(Boolean(data.user));
	const canSubmitPost = $derived(
		Boolean(data.user) &&
			composeTitle.trim().length >= 4 &&
			composeBody.trim().length >= 10 &&
			composeCategory !== null &&
			!composeSubmitting
	);
	const viewingProfile = $derived((profileUserId !== null || accountPanelOpen) && !composing);
	const viewingPost = $derived(selectedPostId !== null && !composing && !viewingProfile);
	const mapPosts = $derived(visiblePosts);
	const connectorPosts = $derived(trendingOpen ? trendingPosts : selectedPosts);
	const connectorEls = $derived(trendingOpen ? trendingItemEls : listItemEls);
	const scrollSpacerHeight = $derived(0);

	function resetFeedVisibility() {
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
	}

	function clearSelectedPost() {
		selectedPostId = null;
		hoveredPostId = null;
		selectedPostDetail = null;
		selectedPostComments = [];
		selectedVotePoints = [];
		selectedVoteUsers = [];
		selectedPostTab = 'discussion';
		selectedCommunityNote = null;
		selectedPostError = '';
		selectedPostRequestId++;
		postDeleteError = '';
		postDeleting = false;
		redrawTrigger++;
		refreshPostsIfStale();
	}

	function closeProfile() {
		profileUserId = null;
		profileDetail = null;
		profileIsOwn = false;
		profileLoading = false;
		profileError = '';
		accountPanelOpen = false;
		profileEditing = false;
		profileSaving = false;
		profileSaveError = '';
		profilePostDeletingId = null;
		profilePostDeleteError = '';
		profileDeleteAccountOpen = false;
		profileDeleteAccountPassword = '';
		profileDeletingAccount = false;
		profileDeleteAccountError = '';
		profileEditAvatarDataUrl = null;
		authSubmitting = false;
		authError = '';
		authMessage = '';
		profileRequestId++;
		refreshPostsIfStale();
	}

	async function loadProfile(id: string) {
		const requestId = ++profileRequestId;
		profileLoading = true;
		profileError = '';

		try {
			const res = await fetch(`/api/users/${id}/profile`);
			if (requestId !== profileRequestId) return;
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as { profile: UserProfile; isOwn: boolean };
			profileDetail = json.profile;
			profileIsOwn = json.isOwn;
			if (json.isOwn) hasUnreadNotifications = false;
			if (!json.isOwn) profileEditing = false;
		} catch {
			if (requestId !== profileRequestId) return;
			profileDetail = null;
			profileIsOwn = false;
			profileError = 'Failed to load this profile. Please try again.';
			profileEditing = false;
		} finally {
			if (requestId === profileRequestId) profileLoading = false;
		}
	}

	function openProfile(id: string) {
		accountPanelOpen = false;
		profileEditing = false;
		profileSaveError = '';
		profilePostDeletingId = null;
		profilePostDeleteError = '';
		profileDeleteAccountOpen = false;
		profileDeleteAccountPassword = '';
		profileDeletingAccount = false;
		profileDeleteAccountError = '';
		profileEditAvatarDataUrl = null;
		profileUserId = id;
		composing = false;
		void resizeMapAfterLayout();
		void loadProfile(id);
	}

	function openAccountPanel() {
		clearSelectedPost();
		profileUserId = null;
		profileDetail = null;
		profileIsOwn = false;
		profileError = '';
		profileLoading = false;
		profileEditing = false;
		profileSaveError = '';
		profileEditAvatarDataUrl = null;
		profileDeleteAccountOpen = false;
		profileDeleteAccountPassword = '';
		profileDeletingAccount = false;
		profileDeleteAccountError = '';
		authPanelMode = 'welcome';
		authPassword = '';
		authError = '';
		authMessage = '';
		accountPanelOpen = true;
		composing = false;
		void resizeMapAfterLayout();
	}

	async function fetchPosts(options: { silent?: boolean; resetFeed?: boolean } = {}) {
		const silent = options.silent ?? false;
		const shouldResetFeed = options.resetFeed ?? !silent;
		const showLoading = !silent || posts.length === 0;
		const requestId = ++fetchRequestId;
		activeFetchController?.abort();
		const controller = new AbortController();
		activeFetchController = controller;
		if (showLoading) loading = true;
		if (!silent) error = null;
		try {
			const res = await fetch('/api/posts?scope=national', { signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (requestId !== fetchRequestId) return;
			lastPostsFetchAt = Date.now();
			error = null;
			posts = json.posts as PostSummary[];
			if (selectedPostId && !posts.some((post) => post.id === selectedPostId)) {
				selectedPostId = null;
				hoveredPostId = null;
			}
			if (shouldResetFeed) resetFeedVisibility();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (requestId !== fetchRequestId) return;
			if (!silent) {
				error = 'Failed to load posts. Please try again.';
				posts = [];
				resetFeedVisibility();
			}
		} finally {
			if (requestId === fetchRequestId) {
				if (showLoading) loading = false;
				activeFetchController = null;
			}
		}
	}

	function refreshPostsIfStale(force = false) {
		if (activeFetchController) return;
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
		if (!force && Date.now() - lastPostsFetchAt < POST_REFRESH_STALE_MS) return;
		void fetchPosts({ silent: posts.length > 0, resetFeed: false });
	}

	async function switchToNational() {
		clearSelectedPost();
		closeProfile();
		if (composing) {
			composing = false;
			composeError = '';
			await resizeMapAfterLayout();
		}
		scope = 'national';
		geoLoading = false;
		geoError = null;
		mapComponent?.fitToBbox(NZ_BBOX);
	}

	async function switchToRegion() {
		clearSelectedPost();
		closeProfile();
		if (composing) {
			composing = false;
			composeError = '';
			await resizeMapAfterLayout();
		}
		scope = 'region';
		geoLoading = false;
		geoError = null;
		zoomToRegion(selectedRegionId);
	}

	async function switchToLocal() {
		clearSelectedPost();
		closeProfile();
		if (composing) {
			composing = false;
			composeError = '';
			await resizeMapAfterLayout();
		}
		scope = 'local';
		geoError = null;

		if (userLocation) {
			setLocalFocus(userLocation.lng, userLocation.lat);
			pauseLocalAutoNational();
			mapComponent?.focusOnLocation(userLocation.lng, userLocation.lat, LOCAL_FOCUS_RADIUS_KM);
		} else {
			requestUserLocation(true);
		}
	}

	function zoomToRegion(regionId: string) {
		const region = NZ_REGIONS.find((r) => r.id === regionId);
		if (region && mapComponent) {
			setLocalFocus(region.center[0], region.center[1]);
			pauseLocalAutoNational();
			mapComponent.fitToBbox(region.bbox);
		}
	}

	function onRegionChange(e: Event) {
		clearSelectedPost();
		closeProfile();
		selectedRegionId = (e.target as HTMLSelectElement).value;
		writeCachedRegion(selectedRegionId);
		scope = 'region';
		zoomToRegion(selectedRegionId);
	}

	function handleMapReady(_map: unknown) {
		mapReady = true;
		mapViewport = mapComponent?.getViewportState() ?? null;
		redrawTrigger++;
	}

	function handleMarkerPositionsChange() {
		mapViewport = mapComponent?.getViewportState() ?? mapViewport;
		if (scope === 'local' && !trendingOpen && mapViewport && Date.now() >= localAutoNationalEnabledAt) {
			if (localPeakZoom === null || mapViewport.zoom > localPeakZoom) {
				localPeakZoom = mapViewport.zoom;
			} else if (
				mapViewport.zoom < LOCAL_AUTO_NATIONAL_ZOOM ||
				mapViewport.zoom < localPeakZoom - LOCAL_ZOOM_OUT_EPSILON
			) {
				scope = 'region';
				geoLoading = false;
				geoError = null;
				localPeakZoom = null;
				clearSelectedPost();
			}
		}
		redrawTrigger++;
	}

	function toggleMapThreeD(e: Event) {
		mapThreeD = (e.currentTarget as HTMLInputElement).checked;
		redrawTrigger++;
	}

	function getMarkerScreenPos(id: string): { x: number; y: number } | null {
		return mapComponent?.getMarkerScreenPos(id) ?? null;
	}

	function focusSelectedPost(post: PostSummary | PostDetail) {
		mapComponent?.fitToPostRadius(post, {
			panelSide: 'left',
			paddingScale: 1.18,
			maxZoom: 14
		});
	}

	async function loadSelectedPost(id: string) {
		const requestId = ++selectedPostRequestId;
		selectedPostLoading = true;
		selectedPostError = '';

		try {
			const res = await fetch(`/api/posts/${id}`);
			if (requestId !== selectedPostRequestId) return;
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as {
				post: PostDetail;
				comments: CommentItem[];
				votePoints?: VotePoint[];
				voteUsers?: VoteUser[];
			};
			selectedPostDetail = json.post;
			selectedPostComments = json.comments;
			selectedVotePoints = json.votePoints ?? [];
			selectedVoteUsers = json.voteUsers ?? [];
			selectedPostTab = 'discussion';
			selectedCommunityNote = json.post.communityNote;
			postDeleteError = '';
			focusSelectedPost(json.post);
		} catch {
			if (requestId !== selectedPostRequestId) return;
			selectedPostDetail = null;
			selectedPostComments = [];
			selectedVotePoints = [];
			selectedVoteUsers = [];
			selectedCommunityNote = null;
			selectedPostError = 'Failed to load this post. Please try again.';
		} finally {
			if (requestId === selectedPostRequestId) selectedPostLoading = false;
		}
	}

	function handleSelectPost(id: string | null) {
		if (trendingOpen) {
			trendingOpen = false;
			lastTrendingFitKey = '';
		}
		if (!id) {
			clearSelectedPost();
			return;
		}
		selectedPostId = id;
		hoveredPostId = id;
		selectedVotePoints = [];
		selectedVoteUsers = [];
		selectedPostTab = 'discussion';
		postDeleteError = '';
		composing = false;
		const summary = visiblePosts.find((post) => post.id === id);
		if (summary) focusSelectedPost(summary);
		void resizeMapAfterLayout();
		void loadSelectedPost(id);
		redrawTrigger++;
	}

	async function reportSelectedPost() {
		if (!selectedPostDetail) return;
		const reason = window.prompt('Reason for reporting this post?');
		if (!reason?.trim()) return;
		await fetch(`/api/posts/${selectedPostDetail.id}/report`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ targetType: 'post', reason: reason.trim() })
		});
		alert('Report submitted. Thank you.');
	}

	function handleSelectedPostVoted(result: {
		verifyCount: number;
		disputeCount: number;
		myVote: PostDetail['myVote'];
		points: VotePoint[];
		voters?: VoteUser[];
	}) {
		selectedVotePoints = result.points;
		if (result.voters) selectedVoteUsers = result.voters;
		if (selectedPostDetail) {
			selectedPostDetail = {
				...selectedPostDetail,
				verifyCount: result.verifyCount,
				disputeCount: result.disputeCount,
				myVote: result.myVote
			};
		}
		posts = posts.map((post) =>
			post.id === selectedPostId
				? {
						...post,
						verifyCount: result.verifyCount,
						disputeCount: result.disputeCount
					}
				: post
		);
		redrawTrigger++;
	}

	function formatRadius(m: number): string {
		if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
		return `${m} m`;
	}

	function formatDate(isoString: string): string {
		const date = new Date(isoString);
		return date.toLocaleDateString('en-NZ', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	}

	function formatJoined(isoString: string): string {
		return new Date(isoString).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
	}

	function regionName(regionId: string): string {
		return NZ_REGIONS.find((region) => region.id === regionId)?.name ?? '';
	}

	function profileRepColor(profile: UserProfile): string {
		const score = profile.reputation.score;
		if (score === null) return 'var(--text-3)';
		if (score >= 80) return 'var(--verify)';
		if (score >= 60) return '#65a30d';
		if (score >= 40) return '#d97706';
		return 'var(--dispute)';
	}

	function startProfileEdit() {
		if (!profileDetail || !profileIsOwn) return;
		profileEditName = profileDetail.displayName;
		profileEditBio = profileDetail.bio ?? '';
		profileEditAge = profileDetail.age ? String(profileDetail.age) : '';
		profileEditLocation = profileDetail.location ?? '';
		profileEditAvatarDataUrl = null;
		profileSaveError = '';
		profileEditing = true;
	}

	function cancelProfileEdit() {
		if (profileSaving) return;
		profileEditing = false;
		profileSaveError = '';
		profileEditAvatarDataUrl = null;
	}

	function openDeleteAccount() {
		if (!profileIsOwn || profileDeletingAccount) return;
		profileDeleteAccountOpen = true;
		profileDeleteAccountPassword = '';
		profileDeleteAccountError = '';
	}

	function cancelDeleteAccount() {
		if (profileDeletingAccount) return;
		profileDeleteAccountOpen = false;
		profileDeleteAccountPassword = '';
		profileDeleteAccountError = '';
	}

	async function readResponseMessage(res: Response, fallback: string) {
		const text = await res.text().catch(() => '');
		if (!text) return fallback;
		try {
			const json = JSON.parse(text) as { message?: string };
			return json.message ?? fallback;
		} catch {
			return text;
		}
	}

	function switchAuthMode(mode: AuthPanelMode) {
		authPanelMode = mode;
		authError = '';
		authMessage = '';
		authPassword = '';
	}

	async function finishInlineAuth() {
		authSubmitting = false;
		authError = '';
		authMessage = '';
		await invalidateAll();
		closeProfile();
	}

	async function handleInlineAuthSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (authSubmitting || authPanelMode === 'welcome') return;

		authSubmitting = true;
		authError = '';
		authMessage = '';

		try {
			const endpoint =
				authPanelMode === 'signup'
					? '/api/auth/signup'
					: '/api/auth/login';
			const body =
				authPanelMode === 'signup'
					? {
							displayName: authDisplayName.trim(),
							email: authEmail.trim(),
							password: authPassword
						}
					: { email: authEmail.trim(), password: authPassword };

			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const text = await res.text();
			const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

			if (!res.ok) {
				authError =
					typeof json.message === 'string'
						? json.message
						: 'That did not work. Please try again.';
				return;
			}

			if (json.status === 'signedIn') {
				await finishInlineAuth();
				return;
			}
		} catch {
			authError = 'Network error. Please try again.';
		} finally {
			authSubmitting = false;
		}
	}

	function handleProfileAvatarChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 2_000_000) {
			profileSaveError = 'Image too large (max 2 MB).';
			input.value = '';
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			profileEditAvatarDataUrl = reader.result as string;
			profileSaveError = '';
		};
		reader.onerror = () => {
			profileSaveError = 'Could not read that image.';
		};
		reader.readAsDataURL(file);
	}

	async function saveProfileEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!profileDetail || !profileIsOwn || profileSaving) return;

		profileSaving = true;
		profileSaveError = '';
		try {
			const body: Record<string, unknown> = {
				displayName: profileEditName.trim(),
				bio: profileEditBio.trim() || null,
				age: profileEditAge ? Number(profileEditAge) : null,
				location: profileEditLocation.trim() || null
			};
			if (profileEditAvatarDataUrl !== null) body.avatarDataUrl = profileEditAvatarDataUrl;

			const res = await fetch('/api/users/me', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				profileSaveError = await readResponseMessage(res, 'Failed to save profile.');
				return;
			}

			profileAvatarVersion++;
			profileEditing = false;
			profileEditAvatarDataUrl = null;
			await loadProfile(profileDetail.id);
			await invalidateAll();
		} catch {
			profileSaveError = 'Network error. Please try again.';
		} finally {
			profileSaving = false;
		}
	}

	async function deleteAccount() {
		if (!profileDetail || !profileIsOwn || profileDeletingAccount) return;
		if (!profileDeleteAccountPassword) {
			profileDeleteAccountError = 'Enter your password to delete your account.';
			return;
		}

		profileDeletingAccount = true;
		profileDeleteAccountError = '';
		try {
			const res = await fetch('/api/users/me', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: profileDeleteAccountPassword })
			});

			if (!res.ok) {
				profileDeleteAccountError = await readResponseMessage(
					res,
					'Could not delete your account.'
				);
				return;
			}

			posts = posts.filter((post) => post.authorId !== profileDetail?.id);
			if (selectedPostDetail?.authorId === profileDetail.id) clearSelectedPost();
			closeProfile();
			await invalidateAll();
			await fetchPosts({ silent: true, resetFeed: false });
		} catch {
			profileDeleteAccountError = 'Network error. Please try again.';
		} finally {
			profileDeletingAccount = false;
		}
	}

	function openProfilePost(id: string) {
		closeProfile();
		handleSelectPost(id);
	}

	async function deleteProfilePost(id: string) {
		if (!profileDetail || profilePostDeletingId) return;
		const ok = window.confirm('Delete this post? This cannot be undone.');
		if (!ok) return;

		profilePostDeletingId = id;
		profilePostDeleteError = '';

		try {
			const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				profilePostDeleteError = await readResponseMessage(res, 'Could not delete this post.');
				return;
			}

			posts = posts.filter((post) => post.id !== id);
			if (selectedPostId === id) clearSelectedPost();
			profileDetail = {
				...profileDetail,
				posts: profileDetail.posts.filter((post) => post.id !== id),
				newComments: profileDetail.newComments.filter((comment) => comment.postId !== id),
				reputation: {
					...profileDetail.reputation,
					postCount: Math.max(0, profileDetail.reputation.postCount - 1)
				}
			};
			redrawTrigger++;
		} catch {
			profilePostDeleteError = 'Network error. Please try again.';
		} finally {
			profilePostDeletingId = null;
		}
	}

	function sliderToRadius(value: number): number {
		const t = Math.min(Math.max(value, 0), RADIUS_SLIDER_MAX) / RADIUS_SLIDER_MAX;
		const raw = RADIUS_MIN_M * Math.pow(RADIUS_MAX_M / RADIUS_MIN_M, t);
		const step = raw < 1000 ? 25 : raw < 10000 ? 100 : 500;
		return Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, Math.round(raw / step) * step));
	}

	function radiusToSlider(radiusM: number): number {
		const clamped = Math.min(Math.max(radiusM, RADIUS_MIN_M), RADIUS_MAX_M);
		const t = Math.log(clamped / RADIUS_MIN_M) / Math.log(RADIUS_MAX_M / RADIUS_MIN_M);
		return Math.round(t * RADIUS_SLIDER_MAX);
	}

	async function resizeMapAfterLayout() {
		await tick();
		mapComponent?.triggerResize();
		setTimeout(() => mapComponent?.triggerResize(), 320);
	}

	function fitComposeRadius(duration = 160) {
		mapComponent?.fitToRadius(composeLng, composeLat, composeRadiusM, {
			panelSide: 'right',
			paddingScale: 1.18,
			duration,
			maxZoom: 15
		});
	}

	function scheduleComposeRadiusFit(duration = 120) {
		if (typeof window === 'undefined') {
			fitComposeRadius(duration);
			return;
		}
		if (composeRadiusFitFrame !== null) {
			cancelAnimationFrame(composeRadiusFitFrame);
		}
		composeRadiusFitFrame = requestAnimationFrame(() => {
			composeRadiusFitFrame = null;
			fitComposeRadius(duration);
		});
	}

	function focusComposeLocation(lng: number, lat: number) {
		composeLng = lng;
		composeLat = lat;
		fitComposeRadius(420);
	}

	async function refreshComposeAreaLabel() {
		const requestId = ++areaLabelRequestId;
		composeAreaLabel = fallbackAreaLabel(composeLng, composeLat, composeRadiusM);

		try {
			const params = new URLSearchParams({
				lng: String(composeLng),
				lat: String(composeLat),
				radiusM: String(composeRadiusM)
			});
			const res = await fetch(`/api/location-label?${params}`);
			if (requestId !== areaLabelRequestId || !res.ok) return;
			const json = (await res.json()) as { label?: string };
			if (json.label) composeAreaLabel = json.label;
		} catch {
			// Keep the local fallback label.
		}
	}

	function openCompose() {
		closeProfile();
		const target = userLocation ?? { lng: localFocusLng, lat: localFocusLat };
		composeLng = target.lng;
		composeLat = target.lat;

		if (!userLocation && data.user) {
			requestUserLocation(true);
		}
		scope = 'local';
		clearSelectedPost();
		trendingOpen = false;
		lastTrendingFitKey = '';
		pauseLocalAutoNational();
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
		composing = true;
		void refreshComposeAreaLabel();
		void resizeMapAfterLayout();
		void tick().then(() => focusComposeLocation(target.lng, target.lat));
	}

	function closeCompose() {
		composing = false;
		composeError = '';
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
		refreshPostsIfStale();
		void resizeMapAfterLayout();
	}

	async function resetMapView() {
		clearSelectedPost();
		closeProfile();
		composing = false;
		composeError = '';
		trendingOpen = false;
		lastTrendingFitKey = '';
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
		await resizeMapAfterLayout();

		if (scope === 'national') {
			geoLoading = false;
			geoError = null;
			mapComponent?.fitToBbox(NZ_BBOX);
			return;
		}

		if (scope === 'local' && userLocation) {
			pauseLocalAutoNational();
			mapComponent?.focusOnLocation(userLocation.lng, userLocation.lat, LOCAL_FOCUS_RADIUS_KM);
			return;
		}

		zoomToRegion(selectedRegionId);
	}

	function handleLogoKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		void resetMapView();
	}

	function handleComposePick(newLng: number, newLat: number) {
		if (!data.user) return;
		if (!isWithinNzBounds(newLng, newLat)) {
			composeError = OUTSIDE_NZ_POST_MESSAGE;
			window.alert(OUTSIDE_NZ_POST_MESSAGE);
			focusComposeLocation(composeLng, composeLat);
			return;
		}
		composeLng = newLng;
		composeLat = newLat;
		void refreshComposeAreaLabel();
		focusComposeLocation(newLng, newLat);
	}

	function handleRadiusInput(e: Event) {
		composeRadiusM = sliderToRadius(Number((e.currentTarget as HTMLInputElement).value));
		void refreshComposeAreaLabel();
		scheduleComposeRadiusFit();
	}

	function handleComposeCategory(cat: PostCategory) {
		composeCategory = cat;
	}

	function handleHeaderImage(dataUrl: string | null) {
		composeHeaderImageDataUrl = dataUrl;
	}

	function handleHeaderImages(dataUrls: string[]) {
		composeImageDataUrls = dataUrls;
		composeHeaderImageDataUrl = dataUrls[0] ?? null;
	}

	async function handleComposeSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmitPost || composeCategory === null) return;
		if (!isWithinNzBounds(composeLng, composeLat)) {
			composeError = OUTSIDE_NZ_POST_MESSAGE;
			window.alert(OUTSIDE_NZ_POST_MESSAGE);
			return;
		}

		composeSubmitting = true;
		composeError = '';

		try {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: composeTitle.trim(),
					body: composeBody.trim(),
					headerImageDataUrl: composeHeaderImageDataUrl,
					imageDataUrls: composeImageDataUrls,
					category: composeCategory,
					anonymous: composeAnonymous,
					lng: composeLng,
					lat: composeLat,
					impactRadiusM: composeRadiusM
				})
			});

			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				composeError = json.message ?? 'Failed to create post. Please try again.';
				return;
			}

			composeTitle = '';
			composeBody = '';
			composeHeaderImageDataUrl = null;
			composeImageDataUrls = [];
			composeCategory = null;
			composeAnonymous = false;
			composing = false;
			await fetchPosts();
			handleSelectPost(json.id);
		} catch {
			composeError = 'Network error. Please check your connection and try again.';
		} finally {
			composeSubmitting = false;
		}
	}

	function handleTrendingOpenChange(open: boolean) {
		trendingOpen = open;
		if (open) {
			clearSelectedPost();
		} else {
			hoveredPostId = null;
			lastTrendingFitKey = '';
			redrawTrigger++;
		}
	}

	async function deleteSelectedPost() {
		if (!selectedPostDetail || postDeleting) return;
		const ok = window.confirm('Delete this post? This cannot be undone.');
		if (!ok) return;
		postDeleting = true;
		postDeleteError = '';

		try {
			const res = await fetch(`/api/posts/${selectedPostDetail.id}`, { method: 'DELETE' });
			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				postDeleteError = json.message ?? 'Could not delete this post.';
				return;
			}
			posts = posts.filter((post) => post.id !== selectedPostDetail?.id);
			clearSelectedPost();
			redrawTrigger++;
		} catch {
			postDeleteError = 'Network error. Please try again.';
		} finally {
			postDeleting = false;
		}
	}

	function handleTrendModeChange(mode: TrendMode) {
		trendMode = mode;
		lastTrendingFitKey = '';
		hoveredPostId = null;
		redrawTrigger++;
	}

	onMount(() => {
		// Instant, prompt-free starting point: the server's IP-derived location
		// beats a stale region cache. Fall back to the cached region otherwise.
		if (data.coarseLocation) {
			const { lng, lat } = data.coarseLocation;
			seedCoarse(lng, lat);
			selectedRegionId = regionForPoint(lng, lat);
			setLocalFocus(lng, lat);
		} else {
			const cachedRegionId = readCachedRegion();
			if (cachedRegionId) {
				selectedRegionId = cachedRegionId;
			}
			const [cachedLng, cachedLat] = regionCenter(selectedRegionId);
			setLocalFocus(cachedLng, cachedLat);
		}
		// Warm the precise GPS fix in the background so the first vote/post is instant.
		prewarm();
		requestUserLocation(false);
		fetchPosts();

		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') refreshPostsIfStale();
		};
		const refreshWhenActive = () => refreshPostsIfStale();
		postRefreshTimer = setInterval(refreshWhenActive, POST_REFRESH_INTERVAL_MS);
		document.addEventListener('visibilitychange', refreshWhenVisible);
		window.addEventListener('focus', refreshWhenActive);
		window.addEventListener('pageshow', refreshWhenActive);

		return () => {
			if (postRefreshTimer !== null) {
				clearInterval(postRefreshTimer);
				postRefreshTimer = null;
			}
			document.removeEventListener('visibilitychange', refreshWhenVisible);
			window.removeEventListener('focus', refreshWhenActive);
			window.removeEventListener('pageshow', refreshWhenActive);
		};
	});

	onDestroy(() => {
		activeFetchController?.abort();
		profileRequestId++;
		if (postRefreshTimer !== null) {
			clearInterval(postRefreshTimer);
			postRefreshTimer = null;
		}
		if (composeRadiusFitFrame !== null) {
			cancelAnimationFrame(composeRadiusFitFrame);
		}
	});

	$effect(() => {
		posts;
		mapReady;
		redrawTrigger;
	});

	$effect(() => {
		if (!trendingOpen || !mapReady || trendingPosts.length === 0) return;
		const fitKey = trendingPosts.map((post) => post.id).join('|');
		if (fitKey === lastTrendingFitKey) return;
		lastTrendingFitKey = fitKey;
		clearSelectedPost();
		mapComponent?.fitToPosts(trendingPosts);
		redrawTrigger++;
	});
</script>

<div class="page" class:composing class:viewing-post={viewingPost} class:viewing-profile={viewingProfile}>
	<header class="header card">
		<div
			class="logo"
			onclick={() => resetMapView()}
			role="button"
			tabindex="0"
			onkeydown={handleLogoKeydown}
		>
			<img alt="logo" src={logo} height="24px">
			
		</div>

		<div class="header-center">
			<div
				class="scope-toggle"
				class:region={scope === 'region'}
				class:local={scope === 'local'}
				class:switching={loading}
				aria-busy={loading}
			>
				<span class="toggle-indicator" aria-hidden="true"></span>
				<button
					type="button"
					class={scope === 'national' ? 'toggle-btn active' : 'toggle-btn'}
					onclick={switchToNational}
					aria-pressed={scope === 'national'}
					disabled={loading}
				>
					National
				</button>
				<button
					type="button"
					class={scope === 'region' ? 'toggle-btn active' : 'toggle-btn'}
					onclick={switchToRegion}
					aria-pressed={scope === 'region'}
					disabled={loading}
				>
					Region
				</button>
				<button
					type="button"
					class={scope === 'local' ? 'toggle-btn active' : 'toggle-btn'}
					onclick={switchToLocal}
					aria-pressed={scope === 'local'}
					disabled={loading}
				>
					Local
				</button>
			</div>

			{#if scope === 'region'}
				<div class="region-controls">
					{#if geoLoading}
						<span class="muted helper-text">Detecting location...</span>
					{/if}
					{#if geoError}
						<span class="error-text helper-text">{geoError}</span>
					{/if}
					<label class="region-picker">
						<span class="region-picker-icon" aria-hidden="true">
							<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
								<path
									d="M8 14s4-3.8 4-7.2A4 4 0 0 0 4 6.8C4 10.2 8 14 8 14Z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linejoin="round"
								/>
								<circle cx="8" cy="6.8" r="1.35" fill="currentColor" />
							</svg>
						</span>
						<select class="region-select" aria-label="Local area" value={selectedRegionId} onchange={onRegionChange}>
							{#each orderedRegions as region (region.id)}
								<option value={region.id}>{region.name}</option>
							{/each}
						</select>
						<span class="region-picker-chevron" aria-hidden="true"></span>
					</label>
				</div>
			{/if}
		</div>

		<div class="header-right">
			<button type="button" class="btn btn-primary header-action-btn" onclick={openCompose}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				New post
			</button>
			<UserMenu
				user={data.user}
				{hasUnreadNotifications}
				onProfileSelect={openProfile}
				onLoginSelect={openAccountPanel}
			/>
		</div>
	</header>

	<main class="main" bind:this={scrollHost}>
		<div class="map-area">
			{#if loading}
				<div class="map-loading" aria-live="polite">
					<div class="spinner"></div>
				</div>
			{/if}

			<HomeMap
				bind:this={mapComponent}
				posts={mapPosts}
				{hoveredPostId}
				{selectedPostId}
				showAllRadii={trendingOpen}
				radiusPosts={trendingPosts}
				{selectedVotePoints}
				onMapReady={handleMapReady}
				onMarkerPositionsChange={handleMarkerPositionsChange}
				onSelectPost={handleSelectPost}
				threeD={mapThreeD}
				{composing}
				composeInteractive={canEditComposeLocation}
				{composeLng}
				{composeLat}
				composeRadiusM={composeRadiusM}
				userLng={mapUserLocation?.lng ?? null}
				userLat={mapUserLocation?.lat ?? null}
				onComposePick={handleComposePick}
			/>

			{#if composing && data.user}
				<div class="compose-radius-overlay">
					<div class="radius-label-row">
						<label class="field-label" for="compose-radius-slider">Affected location</label>
						<span class="radius-value">{formatRadius(composeRadiusM)}</span>
					</div>
					<input
						id="compose-radius-slider"
						type="range"
						class="radius-slider"
						min={0}
						max={RADIUS_SLIDER_MAX}
						step={1}
						value={radiusToSlider(composeRadiusM)}
						oninput={handleRadiusInput}
					/>
					<div class="radius-hints muted">
						<span>100 m</span>
						<span>50 km</span>
					</div>
				</div>
			{/if}

			{#if !composing && !viewingPost && !viewingProfile}
				<div class="trending-overlay">
					<TrendingDropdown
						entries={trendingEntries}
						{scope}
						mode={trendMode}
						open={trendingOpen}
						onOpenChange={handleTrendingOpenChange}
						onModeChange={handleTrendModeChange}
						onSelect={handleSelectPost}
						itemEls={trendingItemEls}
						onItemsChange={() => redrawTrigger++}
					/>
				</div>

				<HeadlineList
					posts={selectedPosts}
					{hoveredPostId}
					onHover={(id) => {
						hoveredPostId = id;
						redrawTrigger++;
					}}
					onSelect={handleSelectPost}
					{listItemEls}
				/>
			{/if}

			{#if rankedPosts.length === 0 && !loading && !composing && !viewingPost && !viewingProfile}
				<div class="empty-state card">
					<div class="empty-icon">📍</div>
					<h2 class="empty-title">No posts here yet</h2>
					<p class="muted empty-body">Be the first to share what's happening in your community.</p>
					<button type="button" class="btn btn-primary" onclick={openCompose}>Create a post</button>
				</div>
			{/if}

			{#if error}
				<div class="error-banner card">
					<span class="error-text">{error}</span>
					<button class="btn" onclick={() => fetchPosts()} style="font-size:12px;padding:6px 12px;">
						Retry
					</button>
				</div>
			{/if}
		</div>
		<div class="feed-scroll-space" aria-hidden="true" style={`height: ${scrollSpacerHeight}px;`}></div>

		{#if viewingPost}
			<aside class="post-panel card" transition:fly={{ x: -80, duration: 260 }}>
				<div class="post-panel-top">
					<div>
						<h1 class="compose-title">
							{selectedPostDetail?.title ?? visiblePosts.find((post) => post.id === selectedPostId)?.title ?? 'Loading post'}
						</h1>
					</div>
					<button type="button" class="close-btn" aria-label="Back" onclick={clearSelectedPost}>
						Back
					</button>
				</div>

				{#if selectedPostLoading}
					<div class="panel-loading">
						<div class="spinner"></div>
						<span class="muted">Loading post...</span>
					</div>
				{:else if selectedPostError}
					<div class="compose-gate">
						<p class="error-text">{selectedPostError}</p>
						<div class="submit-row">
							<button
								type="button"
								class="btn btn-primary"
								onclick={() => selectedPostId && loadSelectedPost(selectedPostId)}
							>
								Retry
							</button>
							<button type="button" class="btn" onclick={clearSelectedPost}>Back</button>
						</div>
					</div>
				{:else if selectedPostDetail}
					{@const post = selectedPostDetail}
					<div class="post-panel-body">
						{#if post.images.length > 0}
							<PostImageGallery images={post.images} flush flushMode="panel" />
						{:else if post.headerImageDataUrl}
							<PostImageGallery
								images={[{ id: `${post.id}-header`, dataUrl: post.headerImageDataUrl, position: 0 }]}
								flush
								flushMode="panel"
							/>
						{/if}

						<div class="article-meta">
							{#if post.category === 'factual'}
								<span class="badge badge-factual">Factual</span>
							{:else}
								<span class="badge">Community notice</span>
							{/if}
							<span class="muted meta-sep">·</span>
							{#if post.anonymous}
								<span class="muted author">Anonymous</span>
							{:else}
								<a
									class="muted author author-link"
									href="/profile/{post.authorId}"
									onclick={(e) => {
										e.preventDefault();
										openProfile(post.authorId);
									}}
								>
									{post.authorName}
								</a>
							{/if}
							<span class="muted meta-sep">·</span>
							<time class="muted" datetime={post.createdAt}>{formatDate(post.createdAt)}</time>
						</div>

						<div class="article-body">
							{#each post.body.split('\n') as paragraph}
								{#if paragraph.trim()}
									<p><LinkifiedText text={paragraph} /></p>
								{/if}
							{/each}
						</div>

							<div class="location-panel">
								<div class="radius-label-row">
									<span class="field-label">Affected area</span>
									<span class="radius-value">{formatRadius(post.impactRadiusM)}</span>
								</div>
								<div class="area-label-row muted">
									<span>{post.areaLabel}</span>
								</div>
							</div>

						{#key post.id}
							{#if post.category === 'factual'}
								<CredibilityMeter
									{post}
									user={data.user}
									onVoted={handleSelectedPostVoted}
								/>
								<CommunityNote note={selectedCommunityNote} />
							{/if}

							{#if post.category === 'factual'}
								<div class="panel-tabs" role="tablist" aria-label="Post panel views">
									<button
										type="button"
										role="tab"
										class:active={selectedPostTab === 'discussion'}
										aria-selected={selectedPostTab === 'discussion'}
										onclick={() => (selectedPostTab = 'discussion')}
									>
										Discussion
									</button>
									<button
										type="button"
										role="tab"
										class:active={selectedPostTab === 'voters'}
										aria-selected={selectedPostTab === 'voters'}
										onclick={() => (selectedPostTab = 'voters')}
									>
										Voters
										<span>{selectedVoteUsers.length}</span>
									</button>
								</div>
							{/if}

							{#if selectedPostTab === 'voters' && post.category === 'factual'}
								<section class="panel-section">
									<h2 class="section-heading">Voters</h2>
									{#if selectedVoteUsers.length === 0}
										<p class="muted voter-empty">No one has voted on this post yet.</p>
									{:else}
										<div class="voter-list">
											{#each selectedVoteUsers as voter (voter.userId)}
												<div class="voter-row">
													<a
														class="voter-name"
														href="/profile/{voter.userId}"
														onclick={(e) => {
															e.preventDefault();
															openProfile(voter.userId);
														}}
													>
														{voter.displayName}
													</a>
													<span class:voter-verify={voter.vote === 'verify'} class:voter-dispute={voter.vote === 'dispute'}>
														{voter.vote === 'verify' ? 'Verified' : 'Disputed'}
													</span>
													<time class="muted" datetime={voter.createdAt}>
														{formatDate(voter.createdAt)}
													</time>
												</div>
											{/each}
										</div>
									{/if}
								</section>
							{:else}
								<section class="panel-section">
									<h2 class="section-heading">Reactions</h2>
									<ReactionBar postId={post.id} reactions={post.reactions} user={data.user} />
								</section>

								<section class="panel-section">
									<CommentThread
										postId={post.id}
										comments={selectedPostComments}
										user={data.user}
										onCommunityNoteUpdated={(note: CommunityNoteData) => (selectedCommunityNote = note)}
									/>
								</section>
							{/if}
						{/key}

						<div class="post-actions">
							<a class="btn" href="/post/{post.id}">Open full page</a>
							{#if post.isOwn}
								<button type="button" class="btn danger-btn" onclick={deleteSelectedPost} disabled={postDeleting}>
									{postDeleting ? 'Deleting...' : 'Delete post'}
								</button>
							{/if}
							{#if postDeleteError}
								<p class="error-text error-msg">{postDeleteError}</p>
							{/if}
							{#if data.user}
								<button type="button" class="report-post-btn muted" onclick={reportSelectedPost}>
									Report this post
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</aside>
		{/if}

		{#if viewingProfile}
			<aside class="profile-panel card" transition:fly={{ y: 120, duration: 260 }}>
				<div class="profile-panel-top">
					<div>
						<p class="section-heading">{accountPanelOpen ? 'Account' : 'Profile'}</p>
						<h1 class="compose-title">
							{accountPanelOpen
								? authPanelMode === 'welcome'
									? 'Welcome to BirdsEye'
									: authPanelMode === 'signup'
										? 'Create account'
										: 'Sign in'
								: profileEditing
									? 'Edit profile'
									: (profileDetail?.displayName ?? 'Loading profile')}
						</h1>
					</div>
					<button type="button" class="close-btn" aria-label="Back" onclick={closeProfile}>
						Back
					</button>
				</div>

				{#if accountPanelOpen}
					{#if authPanelMode === 'welcome'}
						<div class="account-welcome">
							<section class="login-card account-welcome-hero">
								<p class="section-heading">BirdsEye account</p>
								<h2>Join the local signal</h2>
								<p class="muted">
									Create a profile to publish posts, verify reports, and keep your community reputation in one place.
								</p>
								<div class="login-actions">
									<button type="button" class="btn btn-primary" onclick={() => switchAuthMode('signup')}>
										Create account
									</button>
									<button type="button" class="btn" onclick={() => switchAuthMode('login')}>
										Sign in
									</button>
								</div>
							</section>
							<section class="login-card login-card-muted">
								<h2>With an account you can</h2>
								<ul>
									<li>Publish local posts with an affected area.</li>
									<li>Verify or dispute factual reports.</li>
									<li>Build a visible reputation over time.</li>
								</ul>
							</section>
						</div>
					{:else}
						<div class="login-panel-body auth-form-mode">
							<section class="login-card auth-form-card">
							<form class="inline-auth-form" onsubmit={handleInlineAuthSubmit}>
								<h2>{authPanelMode === 'signup' ? 'Create your account' : 'Sign in to your account'}</h2>
								<p class="muted">
									{authPanelMode === 'signup'
										? 'Join BirdsEye to publish, verify, and build a local reputation.'
										: 'Open your profile, manage your posts, and share updates with your community.'}
								</p>
								{#if authPanelMode === 'signup'}
									<div class="field">
										<label class="field-label" for="inline-auth-name">Display name</label>
										<input
											id="inline-auth-name"
											class="input"
											type="text"
											bind:value={authDisplayName}
											disabled={authSubmitting}
											required
										/>
									</div>
								{/if}
								<div class="field">
									<label class="field-label" for="inline-auth-email">Email</label>
									<input
										id="inline-auth-email"
										class="input"
										type="email"
										bind:value={authEmail}
										disabled={authSubmitting}
										required
									/>
								</div>
								<div class="field">
									<label class="field-label" for="inline-auth-password">Password</label>
									<input
										id="inline-auth-password"
										class="input"
										type="password"
										bind:value={authPassword}
										autocomplete={authPanelMode === 'signup' ? 'new-password' : 'current-password'}
										disabled={authSubmitting}
										required
									/>
								</div>

								{#if authMessage}
									<p class="auth-message">{authMessage}</p>
								{/if}
								{#if authError}
									<p class="error-text profile-save-error">{authError}</p>
								{/if}

								<div class="login-actions">
									<button class="btn btn-primary" type="submit" disabled={authSubmitting}>
										{#if authPanelMode === 'signup'}
											{authSubmitting ? 'Creating...' : 'Create account'}
										{:else}
											{authSubmitting ? 'Signing in...' : 'Sign in'}
										{/if}
									</button>
									<button type="button" class="btn" onclick={() => switchAuthMode('welcome')} disabled={authSubmitting}>
										Back
									</button>
								</div>
							</form>
						</section>
						</div>
					{/if}
				{:else if profileLoading}
					<div class="panel-loading">
						<div class="spinner"></div>
						<span class="muted">Loading profile...</span>
					</div>
				{:else if profileError}
					<div class="compose-gate">
						<p class="error-text">{profileError}</p>
						<div class="submit-row">
							<button
								type="button"
								class="btn btn-primary"
								onclick={() => profileUserId && loadProfile(profileUserId)}
							>
								Retry
							</button>
							<button type="button" class="btn" onclick={closeProfile}>Back</button>
						</div>
					</div>
				{:else if profileDetail}
					{@const profile = profileDetail}
					{@const repColor = profileRepColor(profile)}
					{#if profileEditing && profileIsOwn}
						<form class="profile-edit-form" onsubmit={saveProfileEdit}>
							<section class="profile-edit-card">
								<label class="profile-avatar-edit-label">
									{#if profileEditAvatarDataUrl}
										<img class="profile-avatar-img" src={profileEditAvatarDataUrl} alt="" />
									{:else if profile.hasAvatar}
										<img
											class="profile-avatar-img"
											src="/api/users/{profile.id}/avatar?v={profileAvatarVersion}"
											alt=""
										/>
									{:else}
										<div class="profile-avatar-initials">
											{initials(profileEditName || profile.displayName)}
										</div>
									{/if}
									<span class="profile-avatar-overlay">Change photo</span>
									<input
										class="profile-avatar-file"
										type="file"
										accept="image/*"
										onchange={handleProfileAvatarChange}
										disabled={profileSaving}
									/>
								</label>

								<div class="profile-edit-fields">
									<div class="field">
										<label class="field-label" for="profile-edit-name">Display name</label>
										<input
											id="profile-edit-name"
											class="input"
											type="text"
											bind:value={profileEditName}
											maxlength="50"
											disabled={profileSaving}
											required
										/>
									</div>
									<div class="field">
										<label class="field-label" for="profile-edit-bio">Bio</label>
										<textarea
											id="profile-edit-bio"
											class="input profile-edit-bio"
											bind:value={profileEditBio}
											maxlength="280"
											rows="4"
											placeholder="Tell people about yourself..."
											disabled={profileSaving}
										></textarea>
										<span class="field-hint muted">{profileEditBio.length}/280</span>
									</div>
									<div class="profile-edit-row">
										<div class="field">
											<label class="field-label" for="profile-edit-age">Age</label>
											<input
												id="profile-edit-age"
												class="input"
												type="number"
												bind:value={profileEditAge}
												min="1"
												max="120"
												disabled={profileSaving}
											/>
										</div>
										<div class="field">
											<label class="field-label" for="profile-edit-location">Location</label>
											<input
												id="profile-edit-location"
												class="input"
												type="text"
												bind:value={profileEditLocation}
												maxlength="100"
												placeholder="City, Country"
												disabled={profileSaving}
											/>
										</div>
									</div>

									{#if profileSaveError}
										<p class="error-text profile-save-error">{profileSaveError}</p>
									{/if}

									<div class="profile-edit-actions">
										<button
											type="submit"
											class="btn btn-primary"
											disabled={profileSaving || profileEditName.trim().length < 2}
										>
											{profileSaving ? 'Saving...' : 'Save changes'}
										</button>
										<button type="button" class="btn" onclick={cancelProfileEdit} disabled={profileSaving}>
											Cancel
										</button>
									</div>
								</div>
							</section>
						</form>
					{:else}
					<div class="profile-panel-body">
						<section class="profile-summary">
							<div class="profile-avatar-wrap">
								{#if profile.hasAvatar}
									<img
										class="profile-avatar-img"
										src="/api/users/{profile.id}/avatar?v={profileAvatarVersion}"
										alt={profile.displayName}
									/>
								{:else}
									<div class="profile-avatar-initials">{initials(profile.displayName)}</div>
								{/if}
							</div>
							<div class="profile-copy">
								<h2 class="profile-name">{profile.displayName}</h2>
								{#if profile.bio}
									<p class="profile-bio">{profile.bio}</p>
								{/if}
								<div class="profile-meta">
									{#if profile.location}
										<span>{profile.location}</span>
									{/if}
									{#if profile.age}
										<span>Age {profile.age}</span>
									{/if}
									<span>Joined {formatJoined(profile.joinedAt)}</span>
								</div>
								{#if profileIsOwn}
									<div class="profile-account-actions">
										<button type="button" class="btn profile-edit-btn" onclick={startProfileEdit}>
											Edit profile
										</button>
										<form method="POST" action="/auth/logout">
											<button class="btn" type="submit">Sign out</button>
										</form>
									</div>
								{/if}
							</div>
						</section>

						{#if profileIsOwn && profile.newComments.length > 0}
							<section class="profile-notifications">
								<div class="radius-label-row">
									<span class="field-label">New comments</span>
									<span class="radius-value">{profile.newComments.length}</span>
								</div>
								<div class="profile-notification-list">
									{#each profile.newComments as item}
										<article class="profile-notification-item">
											<div class="profile-post-top">
												<strong>{item.authorName}</strong>
												<span class="muted">{timeAgo(item.createdAt)}</span>
											</div>
											<p>{item.body}</p>
											<button
												type="button"
												class="btn profile-post-open"
												onclick={() => openProfilePost(item.postId)}
											>
												{item.postTitle}
											</button>
										</article>
									{/each}
								</div>
							</section>
						{/if}

						{#if profileIsOwn}
							<section class="profile-map-settings">
								<div>
									<span class="field-label">Map view</span>
									<p class="muted profile-rep-copy">Choose how the map is drawn while browsing.</p>
								</div>
								<label class="map-mode-toggle profile-map-toggle" aria-label="Toggle 3D map view">
									<input type="checkbox" checked={mapThreeD} oninput={toggleMapThreeD} />
									<span class="mode-track" aria-hidden="true">
										<span class="mode-thumb"></span>
									</span>
									<span class="mode-label">3D</span>
								</label>
							</section>
						{/if}

						<section class="profile-reputation">
							<div class="radius-label-row">
								<span class="field-label">Reputation</span>
								<span class="radius-value">{profile.reputation.label}</span>
							</div>
							{#if profile.reputation.score !== null}
								<div class="profile-rep-track">
									<div
										class="profile-rep-fill"
										style="width: {profile.reputation.score}%; background: {repColor};"
									></div>
								</div>
								<p class="muted profile-rep-copy">
									{profile.reputation.score}% verified from {profile.reputation.totalVotes}
									{profile.reputation.totalVotes === 1 ? 'vote' : 'votes'}.
								</p>
							{:else}
								<p class="muted profile-rep-copy">
									{profile.reputation.postCount === 0
										? 'No posts yet.'
										: `Not enough votes yet (${profile.reputation.totalVotes}/5).`}
								</p>
							{/if}
						</section>

						{#if profileIsOwn}
							<section class="profile-danger">
								<div class="radius-label-row">
									<span class="field-label">Account</span>
									<span class="radius-value">Permanent</span>
								</div>
								<p class="muted profile-danger-copy">
									Delete your account and everything connected to it, including your posts, comments,
									votes, reactions, and sessions.
								</p>
								{#if profileDeleteAccountOpen}
									<form
										class="profile-danger-confirm"
										onsubmit={(e) => {
											e.preventDefault();
											void deleteAccount();
										}}
									>
										<label class="field" for="profile-delete-password">
											<span class="field-label">Password</span>
											<input
												id="profile-delete-password"
												class="input"
												type="password"
												bind:value={profileDeleteAccountPassword}
												autocomplete="current-password"
												disabled={profileDeletingAccount}
											/>
										</label>
										{#if profileDeleteAccountError}
											<p class="error-text profile-save-error">{profileDeleteAccountError}</p>
										{/if}
										<div class="profile-danger-actions">
											<button
												type="submit"
												class="btn danger-btn"
												disabled={profileDeletingAccount || !profileDeleteAccountPassword}
											>
												{profileDeletingAccount ? 'Deleting...' : 'Delete account'}
											</button>
											<button
												type="button"
												class="btn"
												onclick={cancelDeleteAccount}
												disabled={profileDeletingAccount}
											>
												Back
											</button>
										</div>
									</form>
								{:else}
									<button type="button" class="btn danger-btn profile-delete-account" onclick={openDeleteAccount}>
										Delete account
									</button>
								{/if}
							</section>
						{/if}

						<section class="profile-posts">
							<div class="radius-label-row">
								<span class="field-label">{profileIsOwn ? 'Your posts' : `Posts by ${profile.displayName}`}</span>
								<span class="radius-value">{profile.posts.length}</span>
							</div>
							{#if profile.posts.length === 0}
								<p class="muted profile-empty">No posts yet.</p>
							{:else}
								{#if profilePostDeleteError}
									<p class="error-text profile-save-error">{profilePostDeleteError}</p>
								{/if}
								<div class="profile-post-grid">
									{#each profile.posts as profilePost}
										{@const totalVotes = profilePost.verifyCount + profilePost.disputeCount}
										<article class="profile-post-item">
											<div class="profile-post-top">
												<span class={profilePost.category === 'factual' ? 'badge badge-factual' : 'badge'}>
													{profilePost.category === 'factual' ? 'Factual' : 'Community'}
												</span>
												<span class="muted">{timeAgo(profilePost.createdAt)}</span>
											</div>
											<h3>{profilePost.title}</h3>
											<div class="profile-post-meta muted">
												{#if regionName(profilePost.regionId)}
													<span>{regionName(profilePost.regionId)}</span>
												{/if}
												{#if profilePost.category === 'factual' && totalVotes > 0}
													<span>{Math.round((profilePost.verifyCount / totalVotes) * 100)}% verified</span>
												{/if}
												<span>{profilePost.commentCount} comments</span>
											</div>
											<div class="profile-post-actions">
												<button type="button" class="btn profile-post-open" onclick={() => openProfilePost(profilePost.id)}>
													View post
												</button>
												{#if profileIsOwn}
													<button
														type="button"
														class="btn danger-btn profile-post-delete"
														onclick={() => deleteProfilePost(profilePost.id)}
														disabled={profilePostDeletingId !== null}
													>
														{profilePostDeletingId === profilePost.id ? 'Deleting...' : 'Delete'}
													</button>
												{/if}
											</div>
										</article>
									{/each}
								</div>
							{/if}
						</section>
					</div>
					{/if}
				{/if}
			</aside>
		{/if}

		{#if composing}
			<aside class="compose-panel card" transition:fly={{ x: 80, duration: 260 }}>
				{#if !data.user}
					<div class="compose-gate">
						<div>
							<h1 class="compose-title">Share something with your community</h1>
							<p class="muted compose-sub">You need to sign in before creating a post.</p>
						</div>
						<button type="button" class="btn btn-primary" onclick={openAccountPanel}>
							Sign in to post
						</button>
						<button type="button" class="btn" onclick={closeCompose}>Back</button>
					</div>
				{:else}
					<form class="compose-form" onsubmit={handleComposeSubmit}>
						<div class="compose-top">
							<div>
								<h1 class="compose-title">New post</h1>
								<p class="muted compose-sub">Click the map to place the pin and set the affected area.</p>
							</div>
							<button type="button" class="close-btn" aria-label="Back" onclick={closeCompose}>
								Back
							</button>
						</div>

						<div class="field">
							<span class="field-label">Header image</span>
							<HeaderImageCropper
								disabled={composeSubmitting}
								onimagechange={handleHeaderImage}
								onimageschange={handleHeaderImages}
							/>
							<span class="field-hint muted">Optional. Add up to 6 wide gallery images.</span>
						</div>

						<div class="field">
							<label class="field-label" for="post-title">Title</label>
							<input
								id="post-title"
								class="input"
								type="text"
								placeholder="What happened? Keep it brief."
								bind:value={composeTitle}
								maxlength={140}
								disabled={composeSubmitting}
								required
							/>
							<span class="field-hint muted">{composeTitle.length}/140</span>
						</div>

						<div class="field">
							<label class="field-label" for="post-body">Details</label>
							<textarea
								id="post-body"
								class="input body-input"
								placeholder="Describe what you saw or want to share..."
								bind:value={composeBody}
								rows={7}
								disabled={composeSubmitting}
								required
							></textarea>
						</div>

						<div class="field">
							<span class="field-label">Category</span>
							<CategoryPicker value={composeCategory} onchange={handleComposeCategory} />
						</div>

						<label class="anon-row">
							<input
								type="checkbox"
								bind:checked={composeAnonymous}
								disabled={composeSubmitting}
								class="anon-check"
							/>
							<span class="anon-text">
								Post anonymously
								<span class="field-hint muted">your name will not be shown publicly</span>
							</span>
						</label>

						{#if composeError}
							<p class="error-text error-msg">{composeError}</p>
						{/if}

						<div class="submit-row">
							<button type="submit" class="btn btn-primary submit-btn" disabled={!canSubmitPost}>
								{composeSubmitting ? 'Posting...' : 'Publish post'}
							</button>
							<button type="button" class="btn cancel-btn" onclick={closeCompose}>Cancel</button>
						</div>
					</form>
				{/if}
			</aside>
		{/if}
	</main>

	{#if mapReady && !composing && !viewingPost && !viewingProfile}
		<ConnectorLines
			posts={connectorPosts}
			{hoveredPostId}
			{getMarkerScreenPos}
			listItemEls={connectorEls}
			{redrawTrigger}
			arrowheads={trendingOpen}
		/>
	{/if}
</div>

<style>
	.page {
		height: 100vh;
		overflow: hidden;
		background: var(--bg);
		position: relative;
	}

	.header {
		position: absolute;
		top: 18px;
		left: 20px;
		right: 20px;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 16px;
		height: 64px;
		border-radius: var(--radius-lg);
		border: 1px solid rgba(255, 255, 255, 0.72);
		z-index: 22;
		background: rgba(255, 255, 255, 0.82);
		backdrop-filter: blur(18px);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.header-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		min-width: 282px;
	}

	.scope-toggle {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		position: relative;
		background: rgba(247, 247, 249, 0.8);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 3px;
		gap: 2px;
		min-width: 282px;
		overflow: hidden;
	}

	.toggle-indicator {
		position: absolute;
		top: 3px;
		left: 3px;
		width: calc(33.333% - 4px);
		height: calc(100% - 6px);
		border-radius: calc(var(--radius-sm) - 2px);
		background: rgba(255, 255, 255, 0.92);
		box-shadow: var(--shadow-sm);
		transition: transform 0.2s ease;
		pointer-events: none;
	}

	.scope-toggle.region .toggle-indicator {
		transform: translateX(calc(100% + 2px));
	}

	.scope-toggle.local .toggle-indicator {
		transform: translateX(calc(200% + 4px));
	}

	.scope-toggle.switching {
		opacity: 0.86;
	}

	.toggle-btn {
		padding: 5px 16px;
		border-radius: calc(var(--radius-sm) - 2px);
		border: none;
		background: transparent;
		color: var(--text-2);
		font-size: 13px;
		font-weight: 550;
		transition: color 0.15s ease, transform 0.15s ease;
		position: relative;
		z-index: 1;
	}

	.toggle-btn.active {
		color: var(--text);
		font-weight: 700;
	}

	.toggle-btn:not(.active):hover:enabled {
		color: var(--text);
	}

	.toggle-btn:enabled:active {
		transform: translateY(1px);
	}

	.toggle-btn:disabled {
		cursor: wait;
	}

	.map-mode-toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 34px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: rgba(247, 247, 249, 0.8);
		color: var(--text-2);
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		user-select: none;
	}

	.map-mode-toggle input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.mode-track {
		position: relative;
		width: 36px;
		height: 20px;
		border-radius: 999px;
		background: var(--surface-3);
		box-shadow: inset 0 0 0 1px var(--border-strong);
		transition: background 0.16s ease, box-shadow 0.16s ease;
	}

	.mode-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ffffff;
		box-shadow: 0 1px 3px rgba(15, 23, 42, 0.24);
		transition: transform 0.16s ease;
	}

	.map-mode-toggle input:checked + .mode-track {
		background: #111827;
		box-shadow: inset 0 0 0 1px #111827;
	}

	.map-mode-toggle input:checked + .mode-track .mode-thumb {
		transform: translateX(16px);
	}

	.map-mode-toggle input:focus-visible + .mode-track {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.map-mode-toggle:has(input:checked) {
		color: var(--text);
		background: rgba(255, 255, 255, 0.92);
	}

	.profile-map-toggle {
		flex: 0 0 auto;
		background: #ffffff;
	}

	.region-controls {
		position: absolute;
		left: calc(50% + 153px);
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}

	.region-picker {
		position: relative;
		display: inline-flex;
		align-items: center;
		height: 36px;
		min-width: 174px;
		border: 1px solid rgba(15, 23, 42, 0.12);
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
		color: var(--text);
		transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
	}

	.region-picker:hover {
		border-color: rgba(15, 23, 42, 0.22);
		background: #ffffff;
		box-shadow: 0 10px 28px rgba(15, 23, 42, 0.1);
	}

	.region-picker:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16);
	}

	.region-picker-icon {
		position: absolute;
		left: 11px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		color: var(--accent);
		pointer-events: none;
	}

	.region-select {
		width: 100%;
		height: 100%;
		padding: 0 34px 0 36px;
		border: 0;
		border-radius: inherit;
		appearance: none;
		background: transparent;
		color: var(--text);
		font-size: 13px;
		font-weight: 750;
		cursor: pointer;
	}

	.region-select:focus {
		outline: none;
	}

	.region-picker-chevron {
		position: absolute;
		right: 13px;
		width: 8px;
		height: 8px;
		border-right: 2px solid var(--text-3);
		border-bottom: 2px solid var(--text-3);
		transform: translateY(-2px) rotate(45deg);
		pointer-events: none;
	}

	.helper-text {
		font-size: 12px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.header-action-btn,
	.header-right :global(.header-action-btn) {
		height: 36px;
		min-width: 92px;
		font-size: 13px;
		padding: 0 14px;
	}

	.main {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		position: relative;
	}

	.page.composing .main {
		display: block;
		overflow: hidden;
		padding: 0;
	}

	.page.viewing-post .main {
		display: block;
		overflow: hidden;
		padding: 0;
	}

	.page.viewing-profile .main {
		display: block;
		overflow: hidden;
		padding: 0;
	}

	.map-area {
		position: sticky;
		top: 0;
		overflow: hidden;
		height: 100vh;
	}

	.page.composing .map-area {
		position: absolute;
		inset: 0;
		height: 100vh;
	}

	.page.viewing-post .map-area {
		position: absolute;
		inset: 0;
		height: 100vh;
	}

	.page.viewing-profile .map-area {
		position: absolute;
		inset: 0;
		height: 100vh;
	}

	.feed-scroll-space {
		width: 100%;
	}

	.page.composing .feed-scroll-space {
		display: none;
	}

	.page.viewing-post .feed-scroll-space {
		display: none;
	}

	.page.viewing-profile .feed-scroll-space {
		display: none;
	}

	.map-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
		background: rgba(255, 255, 255, 0.38);
		backdrop-filter: blur(4px);
		pointer-events: none;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border);
		border-top-color: var(--brand-1);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.trending-overlay {
		position: absolute;
		top: 96px;
		left: 18px;
		width: min(320px, calc(100vw - 36px));
		z-index: 20;
	}

	.empty-state {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 32px 20px;
		gap: 12px;
		width: min(420px, calc(100vw - 40px));
		z-index: 20;
		background: rgba(255, 255, 255, 0.88);
		backdrop-filter: blur(14px);
	}

	.empty-icon {
		font-size: 32px;
		line-height: 1;
	}

	.empty-title {
		font-size: 16px;
	}

	.empty-body {
		font-size: 13px;
		margin: 0;
		max-width: 220px;
	}

	.error-banner {
		position: absolute;
		left: 50%;
		bottom: 20px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		z-index: 21;
		background: rgba(255, 255, 255, 0.94);
	}

	.compose-panel {
		position: absolute;
		top: 96px;
		right: 20px;
		bottom: 20px;
		z-index: 18;
		width: min(760px, calc(58vw - 20px));
		min-width: 520px;
		margin: 0;
		padding: 24px;
		overflow-y: auto;
		background: rgba(255, 255, 255, 0.94);
		backdrop-filter: blur(18px);
		border-radius: var(--radius-lg);
		box-shadow: 0 18px 44px rgba(15, 23, 42, 0.12);
	}

	.post-panel {
		position: absolute;
		top: 96px;
		left: 20px;
		bottom: 20px;
		z-index: 18;
		width: min(760px, calc(58vw - 20px));
		min-width: 520px;
		margin: 0;
		padding: 24px;
		overflow-y: auto;
		background: rgba(255, 255, 255, 0.94);
		backdrop-filter: blur(18px);
		border-radius: var(--radius-lg);
		box-shadow: 0 18px 44px rgba(15, 23, 42, 0.12);
	}

	.profile-panel {
		position: absolute;
		top: 96px;
		left: 20px;
		right: 20px;
		bottom: 20px;
		z-index: 22;
		margin: 0;
		padding: 24px;
		overflow-y: auto;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(18px);
		border-radius: var(--radius-lg);
		box-shadow: 0 18px 44px rgba(15, 23, 42, 0.14);
	}

	.post-panel-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 28px;
	}

	.profile-panel-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 18px;
		min-height: 44px;
	}

	.post-panel-body {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 760px;
		margin: 0 auto;
	}

	.profile-panel-body {
		display: grid;
		grid-template-columns: minmax(280px, 0.9fr) minmax(280px, 1fr);
		gap: 18px;
		min-height: 0;
		height: calc(100% - 62px);
	}

	.login-panel-body {
		display: grid;
		grid-template-columns: minmax(280px, 0.9fr) minmax(280px, 1fr);
		gap: 18px;
		min-height: 0;
		height: calc(100% - 62px);
	}

	.account-welcome {
		display: grid;
		grid-template-columns: minmax(320px, 1.05fr) minmax(280px, 0.85fr);
		gap: 18px;
		min-height: 0;
		height: calc(100% - 62px);
	}

	.login-panel-body.auth-form-mode {
		grid-template-columns: minmax(320px, 560px);
		justify-content: center;
		align-content: center;
	}

	.profile-summary,
	.profile-notifications,
	.profile-map-settings,
	.profile-reputation,
	.profile-danger,
	.profile-posts,
	.login-card {
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.72);
		border-radius: var(--radius);
		padding: 18px;
	}

	.login-card {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
		min-height: 260px;
	}

	.account-welcome-hero {
		min-height: 420px;
		padding: 28px;
	}

	.account-welcome-hero h2 {
		font-size: clamp(32px, 5vw, 58px);
		line-height: 0.98;
		letter-spacing: 0;
		max-width: 720px;
	}

	.account-welcome-hero p {
		max-width: 560px;
		font-size: 16px;
		line-height: 1.55;
	}

	.auth-form-card {
		width: min(100%, 560px);
		min-height: 0;
		padding: 24px;
	}

	.inline-auth-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.login-card h2 {
		margin: 0;
		font-size: 22px;
		line-height: 1.15;
	}

	.login-card p,
	.login-card ul {
		margin: 0;
	}

	.login-card ul {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-left: 20px;
		color: var(--text-2);
	}

	.login-card-muted {
		background: rgba(247, 248, 250, 0.8);
	}

	.login-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.auth-message {
		margin: 0;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: 13px;
	}

	.profile-summary {
		display: flex;
		gap: 18px;
		align-items: flex-start;
	}

	.profile-reputation {
		grid-column: 1;
	}

	.profile-map-settings {
		grid-column: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.profile-danger {
		grid-column: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-color: rgba(220, 38, 38, 0.22);
		background: #fffafa;
	}

	.profile-posts {
		grid-column: 2;
		grid-row: 1 / span 4;
	}

	.profile-avatar-wrap {
		flex: 0 0 auto;
	}

	.profile-avatar-img,
	.profile-avatar-initials {
		width: 76px;
		height: 76px;
		border-radius: 50%;
	}

	.profile-avatar-img {
		display: block;
		object-fit: cover;
	}

	.profile-avatar-initials {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gradient);
		color: #fff;
		font-size: 24px;
		font-weight: 750;
	}

	.profile-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.profile-name {
		font-size: 22px;
		font-weight: 750;
		line-height: 1.15;
	}

	.profile-bio {
		margin: 0;
		color: var(--text-2);
		font-size: 14px;
		line-height: 1.55;
	}

	.profile-meta,
	.profile-post-meta,
	.profile-post-top {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 12px;
	}

	.profile-account-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 2px;
	}

	.profile-edit-form {
		min-height: 0;
		height: calc(100% - 62px);
	}

	.profile-edit-card {
		display: grid;
		grid-template-columns: 180px minmax(0, 620px);
		gap: 24px;
		align-items: start;
		max-width: 860px;
		min-height: 0;
		margin: 0 auto;
		padding: 18px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: rgba(255, 255, 255, 0.72);
	}

	.profile-avatar-edit-label {
		position: relative;
		display: block;
		width: 120px;
		height: 120px;
		cursor: pointer;
	}

	.profile-avatar-edit-label .profile-avatar-img,
	.profile-avatar-edit-label .profile-avatar-initials {
		width: 120px;
		height: 120px;
	}

	.profile-avatar-overlay {
		position: absolute;
		inset: auto 0 0;
		padding: 8px 10px;
		border-radius: 0 0 999px 999px;
		background: rgba(20, 20, 26, 0.72);
		color: #fff;
		font-size: 12px;
		font-weight: 700;
		text-align: center;
	}

	.profile-avatar-file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.profile-edit-fields {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}

	.profile-edit-bio {
		min-height: 110px;
		resize: vertical;
	}

	.profile-edit-row {
		display: grid;
		grid-template-columns: minmax(110px, 0.35fr) minmax(180px, 1fr);
		gap: 12px;
	}

	.profile-save-error {
		margin: 0;
	}

	.profile-edit-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.profile-rep-track {
		height: 8px;
		background: var(--surface-3);
		border-radius: 999px;
		overflow: hidden;
		margin: 12px 0 8px;
	}

	.profile-rep-fill {
		height: 100%;
		border-radius: 999px;
	}

	.profile-rep-copy,
	.profile-empty,
	.profile-danger-copy {
		margin: 0;
		font-size: 13px;
	}

	.profile-danger-confirm {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.profile-danger-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.profile-delete-account {
		align-self: flex-start;
	}

	.profile-notification-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 12px;
	}

	.profile-notification-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		padding: 14px;
		border: 1px solid rgba(220, 38, 38, 0.18);
		border-radius: var(--radius-sm);
		background: #fff7f7;
	}

	.profile-notification-item p {
		margin: 0;
		color: var(--text-2);
		font-size: 13px;
		line-height: 1.45;
		line-clamp: 3;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.profile-post-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		margin-top: 12px;
	}

	.profile-post-item {
		display: flex;
		flex-direction: column;
		gap: 9px;
		min-width: 0;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
	}

	.profile-post-item h3 {
		margin: 0;
		font-size: 14px;
		line-height: 1.35;
	}

	.profile-post-open {
		align-self: flex-start;
		margin-top: auto;
	}

	.profile-post-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: auto;
	}

	.profile-post-actions .profile-post-open {
		margin-top: 0;
	}

	.profile-post-delete {
		font-size: 12px;
		padding: 7px 10px;
	}

	.panel-loading {
		min-height: 300px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
	}

	.article-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		font-size: 13px;
	}

	.meta-sep {
		user-select: none;
	}

	.author {
		font-weight: 550;
	}

	.author-link:hover {
		text-decoration: underline;
	}

	.article-body {
		font-size: 15px;
		line-height: 1.7;
		color: var(--text);
	}

	.article-body p {
		margin: 0 0 14px;
	}

	.article-body p:last-child {
		margin-bottom: 0;
	}

	.panel-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.section-heading {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-3);
	}

	.panel-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}

	.panel-tabs button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		height: 34px;
		border: 1px solid transparent;
		border-radius: calc(var(--radius-sm) - 1px);
		background: transparent;
		color: var(--text-2);
		font-size: 13px;
		font-weight: 750;
	}

	.panel-tabs button.active {
		border-color: var(--border);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}

	.panel-tabs span {
		min-width: 20px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--surface-3);
		color: var(--text-2);
		font-size: 11px;
	}

	.voter-empty {
		margin: 0;
		font-size: 13px;
	}

	.voter-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.voter-row {
		display: grid;
		grid-template-columns: minmax(120px, 1fr) auto;
		gap: 4px 10px;
		align-items: center;
		padding: 12px 14px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.voter-row:last-child {
		border-bottom: none;
	}

	.voter-name {
		min-width: 0;
		font-weight: 750;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.voter-name:hover {
		text-decoration: underline;
	}

	.voter-row time {
		grid-column: 1 / -1;
		font-size: 12px;
	}

	.voter-verify,
	.voter-dispute {
		padding: 3px 8px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 750;
	}

	.voter-verify {
		background: var(--verify-soft);
		color: var(--verify);
	}

	.voter-dispute {
		background: var(--dispute-soft);
		color: var(--dispute);
	}

	.post-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding-bottom: 4px;
	}

	.danger-btn {
		color: var(--dispute);
		border-color: rgba(220, 38, 38, 0.28);
	}

	.danger-btn:hover {
		background: var(--dispute-soft);
		box-shadow: none;
	}

	.report-post-btn {
		border: none;
		background: none;
		font-size: 12px;
		cursor: pointer;
		padding: 0;
	}

	.report-post-btn:hover {
		color: var(--dispute);
	}

	.compose-form,
	.compose-gate {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 760px;
		margin: 0 auto;
	}

	.compose-gate {
		min-height: 360px;
		justify-content: center;
		align-items: flex-start;
	}

	.compose-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.compose-title {
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.compose-sub {
		margin: 4px 0 0;
		font-size: 14px;
	}

	.close-btn {
		min-width: 64px;
		height: 34px;
		padding: 0 14px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-2);
		flex-shrink: 0;
		font-weight: 700;
	}

	.close-btn:hover {
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 12px;
		font-weight: 700;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field-hint {
		font-size: 11px;
	}

	.body-input {
		min-height: 168px;
		resize: vertical;
	}

	.anon-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 550;
	}

	.anon-check {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		accent-color: var(--accent);
	}

	.anon-text {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}

	.location-panel {
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.compose-radius-overlay {
		position: absolute;
		left: 16px;
		bottom: 10px;
		z-index: 21;
		width: min(320px, calc(100vw - 32px));
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0;
		text-shadow: 0 1px 2px rgba(255, 255, 255, 0.9);
	}

	.compose-radius-overlay .field-label,
	.compose-radius-overlay .radius-value,
	.compose-radius-overlay .radius-hints {
		color: var(--text);
	}

	.compose-radius-overlay .radius-slider {
		height: 18px;
	}

	.radius-label-row,
	.radius-hints {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}

	.radius-value {
		font-size: 16px;
		font-weight: 800;
		color: #92400e;
	}

	.radius-slider {
		width: 100%;
		accent-color: #d97706;
		cursor: pointer;
	}

	.radius-hints,
	.area-label-row {
		font-size: 11px;
	}

	.area-label-row {
		font-size: 13px;
		font-weight: 650;
		color: var(--text-2);
	}

	.error-msg {
		margin: 0;
		font-size: 13px;
	}

	.submit-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 4px;
	}

	.submit-btn {
		flex: 1;
		padding: 12px 16px;
		font-weight: 750;
	}

	.cancel-btn {
		padding: 12px 18px;
	}

	@media (max-width: 980px) {
		.header {
			top: 12px;
			left: 12px;
			right: 12px;
			height: auto;
			padding: 12px 14px;
			flex-wrap: wrap;
		}

		.header-center {
			order: 3;
			width: 100%;
			justify-content: center;
			min-width: 0;
		}

		.trending-overlay {
			top: 132px;
			left: 12px;
			width: min(320px, calc(100vw - 24px));
		}

		.error-banner {
			width: calc(100vw - 24px);
		}

		.page.composing .main {
			display: block;
			overflow: hidden;
			padding: 0;
		}

		.page.viewing-post .main {
			display: block;
			overflow: hidden;
			padding: 0;
		}

		.page.viewing-profile .main {
			display: block;
			overflow: hidden;
			padding: 0;
		}

		.page.composing .map-area {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100vh;
		}

		.page.viewing-post .map-area {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100vh;
		}

		.page.viewing-profile .map-area {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100vh;
		}

		.compose-panel {
			top: 154px;
			left: 12px;
			right: 12px;
			bottom: 16px;
			width: auto;
			min-width: 0;
			padding-bottom: 156px;
		}

		.compose-radius-overlay {
			left: 12px;
			bottom: 8px;
			width: min(320px, calc(100vw - 24px));
		}

		.post-panel {
			top: 154px;
			left: 12px;
			right: 12px;
			bottom: 16px;
			width: auto;
			min-width: 0;
		}

		.profile-panel {
			top: 154px;
			left: 12px;
			right: 12px;
			bottom: 16px;
		}

		.profile-panel-body,
		.login-panel-body,
		.account-welcome {
			grid-template-columns: 1fr;
		}

		.profile-edit-card {
			grid-template-columns: 1fr;
		}

		.profile-reputation,
		.profile-danger,
		.profile-map-settings,
		.profile-posts {
			grid-column: auto;
			grid-row: auto;
		}
	}

	@media (max-width: 820px) {
		.trending-overlay {
			position: absolute;
			top: auto;
			left: 12px;
			right: 12px;
			bottom: 84px;
			width: auto;
		}
	}

	@media (max-width: 720px) {
		.header-right {
			width: 100%;
			justify-content: space-between;
		}

		.compose-panel {
			padding: 18px;
			padding-bottom: 156px;
		}

		.post-panel {
			padding: 18px;
		}

		.profile-panel {
			padding: 18px;
		}

		.profile-summary {
			flex-direction: column;
		}

		.profile-edit-row {
			grid-template-columns: 1fr;
		}

		.profile-post-grid {
			grid-template-columns: 1fr;
		}

		.login-card {
			justify-content: flex-start;
			min-height: 0;
		}

		.submit-row {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
