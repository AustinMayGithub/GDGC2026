/**
 * BirdsEye — Database Seed Script
 * Run: npx tsx src/lib/server/seed.ts
 * Or:  npm run db:seed
 */

import { randomBytes, scryptSync } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './db/schema';
import { regionForPoint } from '../data/nz-regions';

// ── DB connection ────────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL ?? 'postgres://birdseye:birdseye@localhost:5432/birdseye';
const sql = postgres(url);
const db = drizzle(sql, { schema });

// ── Helpers ──────────────────────────────────────────────────────────────────
function hashPassword(pw: string): string {
	const salt = randomBytes(16).toString('hex');
	return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

function daysAgo(n: number): Date {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
}

function hoursAgo(n: number): Date {
	const d = new Date();
	d.setHours(d.getHours() - n);
	return d;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
	console.log('🌱 Seeding BirdsEye database…');

	// ── 1. Wipe existing data (FK-safe order) ──────────────────────────────
	console.log('  Clearing existing rows…');
	await db.delete(schema.reports);
	await db.delete(schema.communityNotes);
	await db.delete(schema.reactions);
	await db.delete(schema.comments);
	await db.delete(schema.postVotes);
	await db.delete(schema.posts);
	await db.delete(schema.emailOtps);
	await db.delete(schema.sessions);
	await db.delete(schema.signupAttempts);
	await db.delete(schema.users);

	// ── 2. Users ───────────────────────────────────────────────────────────
	console.log('  Inserting users…');
	const PASS = hashPassword('password123');

	const insertedUsers = await db
		.insert(schema.users)
		.values([
			{
				email: 'liam.henderson@gmail.com',
				passwordHash: PASS,
				displayName: 'Liam Henderson',
				emailVerified: true
			},
			{
				email: 'priya.sharma@xtra.co.nz',
				passwordHash: PASS,
				displayName: 'Priya Sharma',
				emailVerified: true
			},
			{
				email: 'mike.te.ao@outlook.com',
				passwordHash: PASS,
				displayName: 'Mike Te Ao',
				emailVerified: true
			},
			{
				email: 'sarah.mcallister@gmail.com',
				passwordHash: PASS,
				displayName: 'Sarah McAllister',
				emailVerified: true
			},
			{
				email: 'news@otagodailyword.co.nz',
				passwordHash: PASS,
				displayName: 'Otago Daily Word',
				emailVerified: true
			},
			{
				email: 'brendan.walsh@xtra.co.nz',
				passwordHash: PASS,
				displayName: 'Brendan Walsh',
				emailVerified: true
			},
			{
				email: 'aroha.ngata@gmail.com',
				passwordHash: PASS,
				displayName: 'Aroha Ngata',
				emailVerified: true
			}
		])
		.returning();

	const [liam, priya, mike, sarah, odw, brendan, aroha] = insertedUsers;

	// ── 3. Posts ───────────────────────────────────────────────────────────
	console.log('  Inserting posts…');

	type PostInsert = typeof schema.posts.$inferInsert;

	const postData: PostInsert[] = [
		// AUCKLAND (dense)
		{
			authorId: liam.id,
			title: 'SH1 Northbound Closed at Newmarket — Major Delays Expected',
			body: `State Highway 1 northbound through Newmarket is closed from 6 am today following a multi-vehicle crash near the Gillies Ave on-ramp. Emergency services are on scene and the closure is expected to last several hours.\n\nDrivers are advised to use Khyber Pass Road or Great South Road as alternatives. Auckland Transport has deployed additional traffic management staff at key intersections. Expect delays of up to 45 minutes during peak hour.`,
			category: 'factual',
			lng: 174.779,
			lat: -36.877,
			impactRadiusM: 8000,
			regionId: regionForPoint(174.779, -36.877),
			createdAt: hoursAgo(3)
		},
		{
			authorId: priya.id,
			title: 'Water Main Burst in Ponsonby — Roads Closed on Franklin Road',
			body: `Watercare crews are responding to a burst 300mm main on Franklin Road, Ponsonby. The road is closed between Collingwood and Richmond Road while repairs are carried out.\n\nResidents in surrounding streets may experience low pressure or discoloured water. Watercare expects to restore supply by early afternoon. Parking restrictions are in effect for the length of the repair works.`,
			category: 'factual',
			lng: 174.745,
			lat: -36.861,
			impactRadiusM: 3000,
			regionId: regionForPoint(174.745, -36.861),
			createdAt: hoursAgo(7)
		},
		{
			authorId: mike.id,
			title: 'Storm Damage Closes Mt Eden Road After Overnight Winds',
			body: `A large pohutukawa fell across Mt Eden Road in the early hours of Sunday morning, following winds gusting to 95 km/h overnight. The tree has brought down a power line and Auckland Transport has confirmed the road will be closed until at least midday.\n\nVector crews are working to make the line safe before the tree can be removed. Neighbouring streets — Balmoral Road and Dominion Road — are handling diverted traffic with significant queuing reported.`,
			category: 'factual',
			lng: 174.757,
			lat: -36.889,
			impactRadiusM: 4000,
			regionId: regionForPoint(174.757, -36.889),
			createdAt: daysAgo(1)
		},
		{
			authorId: sarah.id,
			title: 'Free Community BBQ This Saturday — Grey Lynn Park',
			body: `The Grey Lynn Community Association is hosting a free family BBQ this Saturday from noon to 3 pm at Grey Lynn Park. All welcome — bring a blanket and lawn games if you have them.\n\nSausages, veggie patties and juice provided. There will be a brief slot for locals to share ideas about the upcoming park redevelopment consultation. Dogs on leads are welcome.`,
			category: 'personal',
			lng: 174.743,
			lat: -36.866,
			impactRadiusM: 2000,
			regionId: regionForPoint(174.743, -36.866),
			createdAt: daysAgo(2)
		},
		{
			authorId: aroha.id,
			title: 'Lost Cat — Orange Tabby, Kingsland',
			body: `Our cat Biscuit has been missing since Thursday evening. He is a large orange tabby, neutered, no collar but microchipped. Last seen near the railway line on New North Road, Kingsland.\n\nIf you spot him please don't try to grab him — he's nervous with strangers. Call or text Aroha on 021 555 0194. There is a reward.`,
			category: 'personal',
			lng: 174.748,
			lat: -36.875,
			impactRadiusM: 1500,
			regionId: regionForPoint(174.748, -36.875),
			createdAt: daysAgo(3)
		},
		{
			authorId: liam.id,
			title: 'Auckland Council Approves $2.4M Upgrade for New Lynn Town Centre',
			body: `Auckland Council's Waitākere Ranges Local Board has approved a $2.4 million streetscape upgrade for New Lynn town centre, including new paving, seating, cycleways connections and improved lighting along Clark Street.\n\nWorks are scheduled to begin in February, with completion expected by July. Businesses along the strip have been consulted and temporary loading zone changes will be communicated via letter before works start. Some councillors raised concerns about the project timeline given recent delays on similar contracts.`,
			category: 'factual',
			lng: 174.686,
			lat: -36.909,
			impactRadiusM: 12000,
			regionId: regionForPoint(174.686, -36.909),
			createdAt: daysAgo(4)
		},

		// WELLINGTON (dense)
		{
			authorId: brendan.id,
			title: 'Hutt Road Slip Causes Commuter Chaos on Monday Morning',
			body: `A slip on Hutt Road between Ngauranga and Petone has reduced the road to a single lane in both directions after heavy overnight rain. NZTA says full clearance is unlikely before Tuesday.\n\nWellington's commuter rail lines are running normally, and KiwiRail has confirmed it can handle increased patronage. Bus services on the Hutt Valley corridor are experiencing significant delays. Travellers are encouraged to use Transmission Gully as an alternative where possible.`,
			category: 'factual',
			lng: 174.877,
			lat: -41.228,
			impactRadiusM: 20000,
			regionId: regionForPoint(174.877, -41.228),
			createdAt: hoursAgo(14)
		},
		{
			authorId: priya.id,
			title: 'Wellington City Council Votes to Close Courtenay Place to Traffic on Friday Nights',
			body: `Wellington City Council last night voted 9–5 to trial a pedestrianisation of Courtenay Place between Tory and Blair streets on Friday nights from 10 pm to 4 am, starting from March.\n\nThe trial is for six months and will be reviewed. Supporters say it will reduce alcohol-fuelled incidents and create space for street performers. Opponents — including several bar owners who appeared before the committee — argue it will harm late-night logistics for deliveries and taxis.`,
			category: 'factual',
			lng: 174.778,
			lat: -41.295,
			impactRadiusM: 5000,
			regionId: regionForPoint(174.778, -41.295),
			createdAt: daysAgo(1)
		},
		{
			authorId: sarah.id,
			title: 'Garage Sale — Newtown, Sunday 9am',
			body: `Moving overseas so everything must go. Furniture, kitchenware, books, vinyl records, kids toys and a very good sofa bed. Sunday 9 am–1 pm, 44 Rintoul Street, Newtown.\n\nCash only please. Everything priced to sell — first in first served. No early birds please, the gate won't be open before 9.`,
			category: 'personal',
			lng: 174.782,
			lat: -41.314,
			impactRadiusM: 2500,
			regionId: regionForPoint(174.782, -41.314),
			createdAt: daysAgo(2)
		},
		{
			authorId: mike.id,
			title: 'Miramar Peninsula Flood Warning After 80mm Rainfall in 6 Hours',
			body: `MetService has issued a heavy rain warning for the Wellington region after 80mm fell in the Miramar area in just six hours on Tuesday. Several low-lying streets have surface flooding and the Rongotai roundabout is partially submerged.\n\nWellington City Council is monitoring the situation. The airport access road is passable but slow. Residents near Shelly Bay Road are being asked to monitor the drains and report blockages to the council's 24-hour line.`,
			category: 'factual',
			lng: 174.813,
			lat: -41.330,
			impactRadiusM: 7000,
			regionId: regionForPoint(174.813, -41.330),
			createdAt: daysAgo(3)
		},

		// CANTERBURY
		{
			authorId: odw.id,
			title: 'Christchurch City Council Defers Decision on Proposed Memorial Park Extension',
			body: `Christchurch City Council has deferred a vote on the proposed extension to Roto Kohatu Reserve after a submission from the Canterbury Biodiversity Trust raised concerns about the impact on a nearby mahoe restoration area.\n\nThe item will return to the council's environment and infrastructure committee next month with an updated ecological assessment. Community groups who submitted in favour of the extension expressed frustration at the delay, noting the project has already been through two rounds of consultation.`,
			category: 'factual',
			lng: 172.558,
			lat: -43.524,
			impactRadiusM: 25000,
			regionId: regionForPoint(172.558, -43.524),
			createdAt: daysAgo(5)
		},
		{
			authorId: liam.id,
			title: 'Nor\'west Arch Brings Record Heat to Christchurch — 38°C Forecast',
			body: `A strong nor'west arch is forecast to bring temperatures up to 38°C to the Canterbury Plains on Thursday, according to MetService. This would equal the hottest day recorded in Christchurch since 2009.\n\nFire and Emergency NZ has issued an open-air burn ban for the Canterbury region. Residents are advised to check on elderly neighbours, keep pets inside during the hottest part of the day (noon–4pm), and avoid strenuous outdoor activity.`,
			category: 'factual',
			lng: 172.636,
			lat: -43.531,
			impactRadiusM: 60000,
			regionId: regionForPoint(172.636, -43.531),
			createdAt: daysAgo(6)
		},

		// OTAGO
		{
			authorId: odw.id,
			title: 'Dunedin Hospital Construction Crane Collapse — No Injuries Reported',
			body: `A construction crane at the new Dunedin Hospital site on Castle Street partially collapsed this morning after a structural failure during the lift of a steel beam. No workers were injured and the site has been cleared.\n\nWorksafe NZ inspectors are on-site. Hospital construction manager Downer Group said the incident occurred before workers had moved into the immediate area. Castle Street is closed between Hanover and St David streets and is expected to remain closed overnight.`,
			category: 'factual',
			lng: 170.503,
			lat: -45.872,
			impactRadiusM: 6000,
			regionId: regionForPoint(170.503, -45.872),
			createdAt: daysAgo(2)
		},
		{
			authorId: brendan.id,
			title: 'Queenstown Skifield Road Closed — Ice and Fresh Snow Overnight',
			body: `The Remarkables ski area access road is closed this morning after 25cm of new snow fell overnight and freezing temperatures created significant ice on the upper section. The Coronet Peak road is open but chains are required beyond the carpark.\n\nQueenstown Lakes District Council's roading team is treating the Remarkables road and expects to re-open it by late morning, conditions permitting. Visitors heading to the Remarkables are advised to check the NZSki website before departing.`,
			category: 'factual',
			lng: 168.768,
			lat: -45.031,
			impactRadiusM: 15000,
			regionId: regionForPoint(168.768, -45.031),
			createdAt: daysAgo(1)
		},
		{
			authorId: aroha.id,
			title: 'Otago Farmers Market Celebrates 20 Years This Weekend',
			body: `The Otago Farmers Market at the Dunedin Railway Station marks its 20th anniversary this Saturday with a special celebration stall, live music from the Dunedin Sinfonia String Quartet and free tastings from long-running stallholders.\n\nThe market runs 8am–12:30pm every Saturday as always. The anniversary event will also include a small exhibition of archive photos from the market's early days.`,
			category: 'personal',
			lng: 170.503,
			lat: -45.876,
			impactRadiusM: 5000,
			regionId: regionForPoint(170.503, -45.876),
			createdAt: daysAgo(4)
		},

		// WAIKATO
		{
			authorId: mike.id,
			title: 'Hamilton East Bridge Repair Work to Begin — 12-Week Closure',
			body: `The Riverlea Road bridge over the Waikato River in Hamilton East will close to all traffic from Monday for a 12-week repair programme. Hamilton City Council says the bridge deck has significant deterioration requiring full replacement.\n\nResidents in Hamilton East will need to use the Victoria Bridge or the Claudelands Road bridge as alternatives. A dedicated contra-flow lane for cyclists and pedestrians will be maintained at Victoria Bridge during the works.`,
			category: 'factual',
			lng: 175.293,
			lat: -37.784,
			impactRadiusM: 18000,
			regionId: regionForPoint(175.293, -37.784),
			createdAt: daysAgo(7)
		},

		// BAY OF PLENTY
		{
			authorId: priya.id,
			title: 'Rotorua Sulphur Smell — Council Investigates Increase in Geothermal Activity',
			body: `Rotorua Lakes Council is investigating an increase in hydrogen sulphide odour reported by residents across the central city and Ohinemutu over the past 48 hours. The smell, while unpleasant, is not at levels considered dangerous.\n\nGeothermal monitoring equipment at several reference sites has recorded increased ground temperatures and gas output. GNS Science has been notified and says the activity is consistent with seasonal variation but is being monitored. Residents with respiratory conditions are advised to keep windows closed during periods of strong smell.`,
			category: 'factual',
			lng: 176.249,
			lat: -38.137,
			impactRadiusM: 10000,
			regionId: regionForPoint(176.249, -38.137),
			createdAt: daysAgo(3)
		},

		// NORTHLAND
		{
			authorId: brendan.id,
			title: 'Kaipara Harbour Ferry Service Suspended After Vessel Damage',
			body: `The Kaipara Harbour passenger ferry connecting Dargaville to Pouto Point has been suspended indefinitely after the vessel sustained propeller damage in shallow water near the Pouto bar on Friday.\n\nNorthland Regional Council, which funds the service, says a replacement vessel has been sourced and is expected to resume the route within two weeks. Residents on the Pouto Peninsula who rely on the ferry for medical and school transport are being assisted with road-based alternatives.`,
			category: 'factual',
			lng: 173.857,
			lat: -36.098,
			impactRadiusM: 35000,
			regionId: regionForPoint(173.857, -36.098),
			createdAt: daysAgo(8)
		},

		// HAWKE'S BAY
		{
			authorId: sarah.id,
			title: 'Napier Port Expansion Consent Granted After Two-Year Process',
			body: `Port of Napier has received resource consent from the Hawke's Bay Regional Council to proceed with a major wharf expansion, ending a two-year consent process that attracted 47 submissions.\n\nThe $80 million project will add a second container berth and deepen the channel to allow larger vessels. Consent conditions include a reef monitoring programme and restrictions on night dredging to protect shorebird habitat. Construction is expected to begin mid-year and take 30 months.`,
			category: 'factual',
			lng: 176.916,
			lat: -39.481,
			impactRadiusM: 40000,
			regionId: regionForPoint(176.916, -39.481),
			createdAt: daysAgo(9)
		},

		// MANAWATŪ
		{
			authorId: aroha.id,
			title: 'Palmerston North Cycleway Extension Opens This Week',
			body: `A new 3.2km shared path connecting the Palmerston North city centre to Massey University's main campus opened this Wednesday, part of the broader Te Ahu a Turanga cycle network.\n\nHorizons Regional Council contributed $1.2M toward the project. The path is sealed and lit, and connects to existing off-road sections at Summerhill Drive. Cyclists and pedestrians using the old footpath route along University Avenue are encouraged to switch to the new facility.`,
			category: 'factual',
			lng: 175.607,
			lat: -40.356,
			impactRadiusM: 8000,
			regionId: regionForPoint(175.607, -40.356),
			createdAt: daysAgo(5)
		}
	];

	const insertedPosts = await db.insert(schema.posts).values(postData).returning();

	// Map posts by title for easy reference
	const byTitle = (title: string) => {
		const p = insertedPosts.find((p) => p.title === title);
		if (!p) throw new Error(`Post not found: ${title}`);
		return p;
	};

	const pSH1 = byTitle('SH1 Northbound Closed at Newmarket — Major Delays Expected');
	const pWater = byTitle('Water Main Burst in Ponsonby — Roads Closed on Franklin Road');
	const pStorm = byTitle('Storm Damage Closes Mt Eden Road After Overnight Winds');
	const pNewLynn = byTitle('Auckland Council Approves $2.4M Upgrade for New Lynn Town Centre');
	const pHutt = byTitle('Hutt Road Slip Causes Commuter Chaos on Monday Morning');
	const pCourt = byTitle('Wellington City Council Votes to Close Courtenay Place to Traffic on Friday Nights');
	const pMiramar = byTitle('Miramar Peninsula Flood Warning After 80mm Rainfall in 6 Hours');
	const pChchCouncil = byTitle('Christchurch City Council Defers Decision on Proposed Memorial Park Extension');
	const pNorwest = byTitle('Nor\'west Arch Brings Record Heat to Christchurch — 38°C Forecast');
	const pCrane = byTitle('Dunedin Hospital Construction Crane Collapse — No Injuries Reported');
	const pSkifield = byTitle('Queenstown Skifield Road Closed — Ice and Fresh Snow Overnight');
	const pBridge = byTitle('Hamilton East Bridge Repair Work to Begin — 12-Week Closure');
	const pRotorua = byTitle('Rotorua Sulphur Smell — Council Investigates Increase in Geothermal Activity');
	const pNapier = byTitle('Napier Port Expansion Consent Granted After Two-Year Process');
	const pCycleway = byTitle('Palmerston North Cycleway Extension Opens This Week');

	// ── 4. Votes (factual posts only) ─────────────────────────────────────
	console.log('  Inserting votes…');

	type VoteInsert = typeof schema.postVotes.$inferInsert;

	const voteData: VoteInsert[] = [
		// SH1 crash — strongly verified
		{ postId: pSH1.id, userId: priya.id, vote: 'verify', voterLng: 174.779, voterLat: -36.877 },
		{ postId: pSH1.id, userId: mike.id, vote: 'verify', voterLng: 174.757, voterLat: -36.889 },
		{ postId: pSH1.id, userId: sarah.id, vote: 'verify', voterLng: 174.743, voterLat: -36.866 },
		{ postId: pSH1.id, userId: brendan.id, vote: 'verify', voterLng: 174.779, voterLat: -36.877 },
		{ postId: pSH1.id, userId: aroha.id, vote: 'verify', voterLng: 174.748, voterLat: -36.875 },

		// Water main — mostly verified, one dispute
		{ postId: pWater.id, userId: liam.id, vote: 'verify', voterLng: 174.745, voterLat: -36.861 },
		{ postId: pWater.id, userId: mike.id, vote: 'verify', voterLng: 174.757, voterLat: -36.889 },
		{ postId: pWater.id, userId: sarah.id, vote: 'verify', voterLng: 174.743, voterLat: -36.866 },
		{ postId: pWater.id, userId: odw.id, vote: 'dispute', voterLng: 170.503, voterLat: -45.872 },

		// Storm / Mt Eden — strongly verified
		{ postId: pStorm.id, userId: priya.id, vote: 'verify', voterLng: 174.745, voterLat: -36.861 },
		{ postId: pStorm.id, userId: liam.id, vote: 'verify', voterLng: 174.779, voterLat: -36.877 },
		{ postId: pStorm.id, userId: brendan.id, vote: 'verify', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pStorm.id, userId: aroha.id, vote: 'verify', voterLng: 174.748, voterLat: -36.875 },

		// New Lynn council — contested
		{ postId: pNewLynn.id, userId: priya.id, vote: 'verify', voterLng: 174.686, voterLat: -36.909 },
		{ postId: pNewLynn.id, userId: mike.id, vote: 'dispute', voterLng: 174.757, voterLat: -36.889 },
		{ postId: pNewLynn.id, userId: brendan.id, vote: 'dispute', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pNewLynn.id, userId: sarah.id, vote: 'verify', voterLng: 174.743, voterLat: -36.866 },
		{ postId: pNewLynn.id, userId: aroha.id, vote: 'dispute', voterLng: 174.748, voterLat: -36.875 },

		// Hutt Road — strongly verified
		{ postId: pHutt.id, userId: liam.id, vote: 'verify', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pHutt.id, userId: priya.id, vote: 'verify', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pHutt.id, userId: sarah.id, vote: 'verify', voterLng: 174.782, voterLat: -41.314 },
		{ postId: pHutt.id, userId: aroha.id, vote: 'verify', voterLng: 174.813, voterLat: -41.330 },

		// Courtenay Place — contested
		{ postId: pCourt.id, userId: liam.id, vote: 'verify', voterLng: 174.778, voterLat: -41.295 },
		{ postId: pCourt.id, userId: mike.id, vote: 'verify', voterLng: 174.778, voterLat: -41.295 },
		{ postId: pCourt.id, userId: brendan.id, vote: 'dispute', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pCourt.id, userId: odw.id, vote: 'dispute', voterLng: 170.503, voterLat: -45.872 },
		{ postId: pCourt.id, userId: aroha.id, vote: 'dispute', voterLng: 174.813, voterLat: -41.330 },

		// Miramar flood — mostly verified
		{ postId: pMiramar.id, userId: liam.id, vote: 'verify', voterLng: 174.813, voterLat: -41.330 },
		{ postId: pMiramar.id, userId: brendan.id, vote: 'verify', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pMiramar.id, userId: sarah.id, vote: 'verify', voterLng: 174.782, voterLat: -41.314 },
		{ postId: pMiramar.id, userId: priya.id, vote: 'dispute', voterLng: 174.745, voterLat: -36.861 },

		// Chch Council defer — mostly disputed
		{ postId: pChchCouncil.id, userId: liam.id, vote: 'dispute', voterLng: 172.558, voterLat: -43.524 },
		{ postId: pChchCouncil.id, userId: priya.id, vote: 'dispute', voterLng: 172.636, voterLat: -43.531 },
		{ postId: pChchCouncil.id, userId: mike.id, vote: 'verify', voterLng: 175.293, voterLat: -37.784 },
		{ postId: pChchCouncil.id, userId: sarah.id, vote: 'dispute', voterLng: 174.782, voterLat: -41.314 },

		// Nor'west heat — strongly verified
		{ postId: pNorwest.id, userId: liam.id, vote: 'verify', voterLng: 172.636, voterLat: -43.531 },
		{ postId: pNorwest.id, userId: brendan.id, vote: 'verify', voterLng: 172.636, voterLat: -43.531 },
		{ postId: pNorwest.id, userId: aroha.id, vote: 'verify', voterLng: 172.636, voterLat: -43.531 },
		{ postId: pNorwest.id, userId: sarah.id, vote: 'verify', voterLng: 174.782, voterLat: -41.314 },
		{ postId: pNorwest.id, userId: odw.id, vote: 'verify', voterLng: 170.503, voterLat: -45.872 },

		// Crane collapse — strongly verified
		{ postId: pCrane.id, userId: liam.id, vote: 'verify', voterLng: 170.503, voterLat: -45.872 },
		{ postId: pCrane.id, userId: priya.id, vote: 'verify', voterLng: 170.503, voterLat: -45.872 },
		{ postId: pCrane.id, userId: sarah.id, vote: 'verify', voterLng: 170.503, voterLat: -45.872 },
		{ postId: pCrane.id, userId: mike.id, vote: 'verify', voterLng: 175.293, voterLat: -37.784 },
		{ postId: pCrane.id, userId: aroha.id, vote: 'dispute', voterLng: 174.748, voterLat: -36.875 },

		// Ski road — mostly verified
		{ postId: pSkifield.id, userId: liam.id, vote: 'verify', voterLng: 168.768, voterLat: -45.031 },
		{ postId: pSkifield.id, userId: priya.id, vote: 'verify', voterLng: 168.768, voterLat: -45.031 },
		{ postId: pSkifield.id, userId: odw.id, vote: 'verify', voterLng: 170.503, voterLat: -45.872 },
		{ postId: pSkifield.id, userId: mike.id, vote: 'dispute', voterLng: 175.293, voterLat: -37.784 },

		// Bridge — strongly verified
		{ postId: pBridge.id, userId: liam.id, vote: 'verify', voterLng: 175.293, voterLat: -37.784 },
		{ postId: pBridge.id, userId: sarah.id, vote: 'verify', voterLng: 175.293, voterLat: -37.784 },
		{ postId: pBridge.id, userId: brendan.id, vote: 'verify', voterLng: 175.293, voterLat: -37.784 },

		// Rotorua sulphur — contested
		{ postId: pRotorua.id, userId: liam.id, vote: 'verify', voterLng: 176.249, voterLat: -38.137 },
		{ postId: pRotorua.id, userId: brendan.id, vote: 'dispute', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pRotorua.id, userId: sarah.id, vote: 'dispute', voterLng: 174.782, voterLat: -41.314 },
		{ postId: pRotorua.id, userId: odw.id, vote: 'verify', voterLng: 170.503, voterLat: -45.872 },

		// Napier port — mostly verified
		{ postId: pNapier.id, userId: liam.id, vote: 'verify', voterLng: 176.916, voterLat: -39.481 },
		{ postId: pNapier.id, userId: mike.id, vote: 'verify', voterLng: 175.293, voterLat: -37.784 },
		{ postId: pNapier.id, userId: brendan.id, vote: 'dispute', voterLng: 174.877, voterLat: -41.228 },
		{ postId: pNapier.id, userId: priya.id, vote: 'verify', voterLng: 174.745, voterLat: -36.861 },

		// Cycleway — strongly verified
		{ postId: pCycleway.id, userId: aroha.id, vote: 'verify', voterLng: 175.607, voterLat: -40.356 },
		{ postId: pCycleway.id, userId: sarah.id, vote: 'verify', voterLng: 175.607, voterLat: -40.356 },
		{ postId: pCycleway.id, userId: liam.id, vote: 'verify', voterLng: 174.779, voterLat: -36.877 }
	];

	await db.insert(schema.postVotes).values(voteData);

	// ── 5. Comments ────────────────────────────────────────────────────────
	console.log('  Inserting comments…');

	type CommentInsert = typeof schema.comments.$inferInsert;

	// Courtenay Place — rich thread (10 comments) → will get a community note
	const courtComments: CommentInsert[] = [
		{
			postId: pCourt.id,
			authorId: liam.id,
			body: `About time. Friday nights on Courtenay are already chaos — pedestrians weaving around taxis and rideshares that double-park everywhere. If it takes pressure off the footpath this is a win.`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: brendan.id,
			body: `The bar owners have a point. I do deliveries for a couple of venues on that strip. Where exactly are we supposed to unload between midnight and 4 am? The council didn't consult anyone who actually works at night.`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: priya.id,
			body: `I live on Ghuznee Street and the noise and fighting on Friday nights is genuinely bad. Anything that slows down the car traffic has to be worth a try at least.`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: sarah.id,
			body: `The council keeps doing these six-month trials and then making them permanent regardless of feedback. Would be good if this one had actual criteria for success upfront.`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: mike.id,
			body: `Taxi stands are going to be the real pinch point. There's nowhere else on that block that works. Has anyone seen a traffic management plan?`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: aroha.id,
			body: `The street performers angle is a bit of a stretch — it's 10pm to 4am, not exactly busking hours. But reducing vehicle traffic near drunk crowds does make sense from a safety perspective.`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: odw.id,
			body: `Nine to five vote is tighter than I expected. The ones voting against — were they all responding to the bar owner submissions, or was there a principled traffic argument from anyone?`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: liam.id,
			body: `@Mike Te Ao — WCC published the TMP on their website yesterday. Tory Street becomes two-way during the closure to take displacement. Not perfect but not as bad as feared.`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: brendan.id,
			body: `Making Tory two-way is going to cause chaos for the restaurants on Tory — they rely on the kerb space for kitchen deliveries in the early hours. Council really should have sat down with operators before finalising anything.`,
			createdAt: daysAgo(1)
		},
		{
			postId: pCourt.id,
			authorId: priya.id,
			body: `Just to add data: Auckland's Fort Street pedestrian hours cut assault stats by 22% after year one according to the Herald. Wellington's numbers are different but it's not a zero-sum call.`,
			createdAt: daysAgo(1)
		}
	];

	// New Lynn — rich thread (8 comments) → will get a community note
	const newLynnComments: CommentInsert[] = [
		{
			postId: pNewLynn.id,
			authorId: mike.id,
			body: `The Clark Street upgrade has been on the cards since 2019. If they actually start in February I'll believe it when I see it. These contracts always blow out.`,
			createdAt: daysAgo(4)
		},
		{
			postId: pNewLynn.id,
			authorId: sarah.id,
			body: `I think the cycleway connection is the most important part of this — the current gap between the Northwestern and the town centre is genuinely dangerous.`,
			createdAt: daysAgo(4)
		},
		{
			postId: pNewLynn.id,
			authorId: aroha.id,
			body: `$2.4M feels light for what they're describing. New paving alone on a street that length is expensive. What's actually in scope?`,
			createdAt: daysAgo(4)
		},
		{
			postId: pNewLynn.id,
			authorId: brendan.id,
			body: `The businesses who got consulted are happy — I spoke to a few of them. The concern is the loading zone changes during works because the delivery windows are tight for some of the food places.`,
			createdAt: daysAgo(4)
		},
		{
			postId: pNewLynn.id,
			authorId: liam.id,
			body: `The timeline concern from councillors is legitimate — the Te Atatū upgrade ran four months over and that was simpler. Seven months for this is very optimistic.`,
			createdAt: daysAgo(3)
		},
		{
			postId: pNewLynn.id,
			authorId: priya.id,
			body: `New Lynn really needs this. The town centre feels neglected compared to what Henderson has received. Hope the contractor delivers.`,
			createdAt: daysAgo(3)
		},
		{
			postId: pNewLynn.id,
			authorId: mike.id,
			body: `Is the seating going to be actual benches or those anti-homeless single-seat things? Because the latter would be a pretty grim choice for a community upgrade.`,
			createdAt: daysAgo(3)
		},
		{
			postId: pNewLynn.id,
			authorId: sarah.id,
			body: `The local board minutes say "community seating with appropriate design" which is council-speak that doesn't rule either option in or out unfortunately.`,
			createdAt: daysAgo(3)
		}
	];

	// Crane collapse — 9 comments
	const craneComments: CommentInsert[] = [
		{
			postId: pCrane.id,
			authorId: liam.id,
			body: `Really glad no one was hurt. The timing was lucky — they had just moved the steel fixing crew out of that bay twenty minutes earlier according to the site foreman.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: brendan.id,
			body: `This project has already had two safety notices from Worksafe in the last year. This is going to put the construction programme back significantly.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: aroha.id,
			body: `The hospital build is already well behind schedule. A crane incident investigation takes weeks minimum. Dunedin residents have been waiting years for this facility.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: priya.id,
			body: `Downer's record on major NZ infrastructure projects over the last five years has not been great. Can the government actually hold them to account on the timeline and costs?`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: mike.id,
			body: `Castle Street being closed is really disruptive for the uni precinct. Two bus routes run through there. RDU are saying students should plan extra time for the rest of the week.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: odw.id,
			body: `The Otago Daily Times is reporting the crane failure was on the luffing mechanism, not the slew ring. Worksafe will determine root cause but that suggests a maintenance issue rather than operator error.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: liam.id,
			body: `@Otago Daily Word — is the ODT reporting that officially or is that sourced from someone on site? Makes a big difference to how quickly the investigation wraps up.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: odw.id,
			body: `On-site source, not confirmed by Downer or Worksafe. Treat it as unverified. We're waiting on the official statement.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pCrane.id,
			authorId: sarah.id,
			body: `Regardless of cause — the main thing is the safety outcome was okay. Hoping Worksafe moves quickly so the build can restart without too much delay for the community's sake.`,
			createdAt: daysAgo(2)
		}
	];

	// SH1 crash — 5 comments
	const sh1Comments: CommentInsert[] = [
		{
			postId: pSH1.id,
			authorId: priya.id,
			body: `I drove past at 6:30 and confirmed — it's completely blocked, police and two firetrucks on scene. Go via Khyber Pass.`,
			createdAt: hoursAgo(3)
		},
		{
			postId: pSH1.id,
			authorId: mike.id,
			body: `Waze is already rerouting everything through Parnell. Parnell Rise is crawling. Give it an hour before you head out if you can.`,
			createdAt: hoursAgo(3)
		},
		{
			postId: pSH1.id,
			authorId: liam.id,
			body: `Does anyone know if the Southern Motorway northbound is also affected? AT says delays but not closures.`,
			createdAt: hoursAgo(2)
		},
		{
			postId: pSH1.id,
			authorId: brendan.id,
			body: `Southern is flowing okay. Stick to that if you're coming from Penrose direction.`,
			createdAt: hoursAgo(2)
		},
		{
			postId: pSH1.id,
			authorId: aroha.id,
			body: `AT Alerts just posted: one lane reopened as of 8:15am. Should clear within 30 mins if you haven't left yet.`,
			createdAt: hoursAgo(1)
		}
	];

	// Rotorua — 4 comments
	const rotoruaComments: CommentInsert[] = [
		{
			postId: pRotorua.id,
			authorId: liam.id,
			body: `I live near the Ohinemutu geothermal area and this is noticeably stronger than usual. Been here twelve years and this week is up there with the worst I've noticed.`,
			createdAt: daysAgo(3)
		},
		{
			postId: pRotorua.id,
			authorId: brendan.id,
			body: `The council says not dangerous but H2S has long-term exposure risks at much lower concentrations than what's considered acutely hazardous. I'd like to see the actual sensor readings published.`,
			createdAt: daysAgo(3)
		},
		{
			postId: pRotorua.id,
			authorId: mike.id,
			body: `Rotorua always smells, tourists just have to deal with it — this is a bit dismissive of what locals are actually experiencing this week.`,
			createdAt: daysAgo(3)
		},
		{
			postId: pRotorua.id,
			authorId: sarah.id,
			body: `GNS updates are usually posted on their volcano and geothermal hazards pages. Worth checking there for the monitoring data if the council isn't releasing it directly.`,
			createdAt: daysAgo(3)
		}
	];

	// Personal post comments (Grey Lynn BBQ)
	const pBbq = insertedPosts.find((p) => p.title.includes('Free Community BBQ'))!;
	const bbqComments: CommentInsert[] = [
		{
			postId: pBbq.id,
			authorId: liam.id,
			body: `Great initiative — will come along with the kids. Is there a contact for the park redevelopment consultation ahead of Saturday?`,
			createdAt: daysAgo(2)
		},
		{
			postId: pBbq.id,
			authorId: aroha.id,
			body: `I'll bring a fruit platter. See you there.`,
			createdAt: daysAgo(2)
		},
		{
			postId: pBbq.id,
			authorId: mike.id,
			body: `Is the pergola side of the park accessible? My dad uses a wheelchair.`,
			createdAt: daysAgo(1)
		}
	];

	const allComments: CommentInsert[] = [
		...courtComments,
		...newLynnComments,
		...craneComments,
		...sh1Comments,
		...rotoruaComments,
		...bbqComments
	];

	await db.insert(schema.comments).values(allComments);

	// ── 6. Community Notes ─────────────────────────────────────────────────
	console.log('  Inserting community notes…');

	await db.insert(schema.communityNotes).values([
		{
			postId: pCourt.id,
			body: `Commenters are divided on the pedestrianisation trial. Several residents welcome the move, citing pedestrian safety and noise reduction on Friday nights, and one commenter referenced Auckland data suggesting similar policies reduce assaults. However, late-night operators and delivery workers express strong concern about logistics — particularly the displacement of loading zones onto Tory Street and the impact on taxi stands. A few commenters question whether the council's six-month trial process will genuinely incorporate feedback before a permanent decision. The traffic management plan has been mentioned but opinions on its adequacy vary.`,
			basedOnCommentCount: 10,
			generatedAt: daysAgo(1)
		},
		{
			postId: pNewLynn.id,
			body: `Commenters broadly support the New Lynn upgrade but several express scepticism about the February–July timeline, citing delays on comparable Auckland Transport projects. The cycleway connection is highlighted as the most valued element. Questions are raised about the actual scope of the $2.4M budget and whether the seating design will be community-friendly. Business operators reportedly consulted are described as supportive, though delivery logistics during works remain a concern. No commenters dispute that the investment is overdue.`,
			basedOnCommentCount: 8,
			generatedAt: daysAgo(3)
		},
		{
			postId: pCrane.id,
			body: `Commenters are relieved no workers were injured, with several noting the timing was fortunate. There is significant concern about further delays to an already-behind-schedule hospital build, and some commenters raise Downer's wider track record on New Zealand infrastructure projects. One commenter (citing an on-site source, not officially confirmed) suggests the failure was in the crane's luffing mechanism rather than operator error, which prompted a discussion about whether this points to maintenance issues. The disruption to Castle Street and nearby bus routes is also noted. Commenters broadly agree that a thorough Worksafe investigation is needed before works resume.`,
			basedOnCommentCount: 9,
			generatedAt: daysAgo(2)
		}
	]);

	// ── 7. Reactions ───────────────────────────────────────────────────────
	console.log('  Inserting reactions…');

	type ReactionInsert = typeof schema.reactions.$inferInsert;

	const pFarmers = insertedPosts.find((p) => p.title.includes('Otago Farmers Market'))!;

	const reactionData: ReactionInsert[] = [
		// SH1
		{ postId: pSH1.id, userId: priya.id, emoji: '😮' },
		{ postId: pSH1.id, userId: sarah.id, emoji: '😟' },
		{ postId: pSH1.id, userId: aroha.id, emoji: '😮' },
		// Courtenay Place
		{ postId: pCourt.id, userId: liam.id, emoji: '🔥' },
		{ postId: pCourt.id, userId: mike.id, emoji: '😟' },
		{ postId: pCourt.id, userId: brendan.id, emoji: '😟' },
		{ postId: pCourt.id, userId: priya.id, emoji: '👍' },
		// Crane
		{ postId: pCrane.id, userId: aroha.id, emoji: '😮' },
		{ postId: pCrane.id, userId: liam.id, emoji: '😟' },
		{ postId: pCrane.id, userId: brendan.id, emoji: '😮' },
		{ postId: pCrane.id, userId: priya.id, emoji: '😟' },
		// Grey Lynn BBQ (personal)
		{ postId: pBbq.id, userId: liam.id, emoji: '❤️' },
		{ postId: pBbq.id, userId: aroha.id, emoji: '👍' },
		{ postId: pBbq.id, userId: mike.id, emoji: '❤️' },
		// Nor'west heat
		{ postId: pNorwest.id, userId: brendan.id, emoji: '🔥' },
		{ postId: pNorwest.id, userId: sarah.id, emoji: '😟' },
		// Ski road
		{ postId: pSkifield.id, userId: odw.id, emoji: '😮' },
		{ postId: pSkifield.id, userId: priya.id, emoji: '😟' },
		// Farmers market (personal)
		{ postId: pFarmers.id, userId: liam.id, emoji: '❤️' },
		{ postId: pFarmers.id, userId: sarah.id, emoji: '👍' }
	];

	await db.insert(schema.reactions).values(reactionData);

	// ── 8. Summary ─────────────────────────────────────────────────────────
	console.log('\n✅ Seed complete:');
	console.log(`   Users:            ${insertedUsers.length}`);
	console.log(`   Posts:            ${insertedPosts.length}`);
	console.log(`   Post votes:       ${voteData.length}`);
	console.log(`   Comments:         ${allComments.length}`);
	console.log(`   Community notes:  3`);
	console.log(`   Reactions:        ${reactionData.length}`);
}

main()
	.catch((err) => {
		console.error('Seed failed:', err);
		process.exit(1);
	})
	.finally(() => sql.end().then(() => process.exit(0)));
