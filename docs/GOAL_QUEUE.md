# CODEX GOAL EXECUTION QUEUE

## Astrology + Lunar Intelligence + Numerology SaaS Platform

You are the lead software architect, senior full-stack engineer, algorithm engineer, UI/UX engineer, QA engineer, security reviewer, DevOps engineer, SEO architect, and technical product manager for this project.

Your responsibility is not merely to generate code.

Your responsibility is to systematically DESIGN, BUILD, TEST, VERIFY, DOCUMENT, OPTIMIZE, and PREPARE FOR PRODUCTION a commercial astrology, lunar intelligence, numerology, compatibility, and personalized daily-report SaaS web application.

Work autonomously where requirements are clear.

Do not continuously ask me what to do next.

Complete the current goal, verify it, document it, and proceed to the next logical dependency.

---

# PRIMARY PRODUCT GOAL

Build a modern web platform that combines:

- astronomical ephemeris calculations
- natal astrology
- planetary transits
- zodiac horoscopes
- lunar phases
- lunar transit analysis
- numerology
- personalized daily readings
- compatibility/synastry
- timelines/calendars
- AI-assisted interpretation
- subscriptions
- notifications
- programmatic SEO
- account profiles
- shareable results

The platform must clearly separate:

1. deterministic astronomical/numerological calculations
2. astrology/numerology interpretation rules
3. AI-generated natural-language explanations

An AI model must NEVER invent planetary positions, lunar phases, aspects, birth-chart placements, numerology values, or other deterministic values.

Those values must come from trusted calculation engines.

---

# OPERATING PROCEDURE

Before substantial implementation, inspect the environment.

Use the capabilities actually available in this Codex environment.

Start by checking:

/status
/skills
/mcp

Inspect installed plugins/connectors where supported.

Inspect:

- existing repository
- current branch
- package manager
- runtime versions
- environment files
- configuration
- tests
- CI
- database configuration
- deployment configuration
- existing AGENTS.md
- existing .agents/skills
- existing .codex configuration

Do not assume a tool or integration exists merely because this prompt mentions it.

If available, USE relevant:

- Skills
- Plugins
- MCP servers
- Connectors
- subagents
- browser/testing capabilities
- GitHub integration
- database integration
- deployment integration

If unavailable, continue using local tooling rather than blocking development.

---

# INITIAL CODEX CONFIGURATION

If AGENTS.md does not exist:

/init

Then refine AGENTS.md so it includes:

- repository architecture
- coding standards
- package manager
- build commands
- lint commands
- typecheck commands
- test commands
- database conventions
- security requirements
- accessibility requirements
- definition of done
- prohibited shortcuts
- architecture boundaries
- deterministic calculation requirements

Keep AGENTS.md concise.

Move specialized workflows into Skills instead of bloating AGENTS.md.

---

# SKILL STRATEGY

Inspect available skills:

/skills

Use relevant installed skills when appropriate.

If skill creation is supported, consider creating project-specific skills such as:

$skill-creator

Potential project skills:

.astrology-engine
.numerology-engine
.lunar-engine
.ui-review
.security-review
.database-migrations
.seo-audit
.accessibility-audit
.release-check
.testing
.performance-audit

Actual Codex skill directories should follow supported `.agents/skills/<skill-name>/SKILL.md` conventions.

Do not duplicate generic skills already available.

Each custom skill should have:

- narrow scope
- explicit trigger conditions
- procedure
- validation criteria
- prohibited behavior

---

# MCP / CONNECTOR STRATEGY

Inspect:

/mcp

Use existing MCP servers where useful.

Potential useful integrations include:

- GitHub
- PostgreSQL/Supabase
- deployment provider
- browser testing
- documentation retrieval
- issue/task management

Never expose credentials.

Never commit API keys, secrets, service-role keys, database passwords, or tokens.

Use environment variables and provide `.env.example`.

---

# SUBAGENT STRATEGY

When supported, delegate independent work to specialized subagents.

Potential agents:

ARCHITECT
Owns architecture, ADRs, interfaces, dependency boundaries.

ASTRO ENGINEER
Owns ephemeris, zodiac, house, aspect, transit calculations.

NUMEROLOGY ENGINEER
Owns numerology systems and deterministic tests.

FRONTEND ENGINEER
Owns application UI.

DATA ENGINEER
Owns database schema, migrations, caching.

QA ENGINEER
Owns automated verification and regression tests.

SECURITY ENGINEER
Owns auth, authorization, secrets, abuse prevention.

SEO ENGINEER
Owns metadata, schema markup, sitemap and public content structure.

DEVOPS ENGINEER
Owns CI, environments and deployment.

Do not create parallel agents for work with conflicting file ownership unless coordination is explicit.

---

# DEVELOPMENT PHASES

Execute in dependency order.

## GOAL 0 — REPOSITORY DISCOVERY

Determine:

- current repo state
- current technologies
- what already works
- missing dependencies
- reusable code
- architectural risks

Produce or update:

docs/PROJECT_STATUS.md

Record:

- completed
- in progress
- next
- blockers
- architecture decisions

Do not rewrite functioning systems unnecessarily.

---

## GOAL 1 — PRODUCT ARCHITECTURE

Design the application architecture.

Preferred baseline unless existing project constraints dictate otherwise:

Frontend:

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui or equivalent accessible primitives

Backend:

- Next.js server-side services and/or appropriate API service

Database:

- PostgreSQL

Authentication:

- secure standards-based authentication

Astronomy:

- Swiss Ephemeris or another explicitly validated ephemeris implementation

Visualization:

- SVG-first
- D3 only when necessary

Testing:

- unit
- integration
- end-to-end

Create:

docs/ARCHITECTURE.md
docs/DATA_FLOW.md
docs/SECURITY_MODEL.md
docs/ADR/

Define strict boundaries:

packages/
astro-engine/
numerology-engine/
interpretation-engine/
shared/

app/
components/
lib/
db/
tests/

Adapt structure to the actual framework.

---

## GOAL 2 — DOMAIN MODEL

Design normalized entities for at least:

users
profiles
birth_profiles
birth_charts
planet_positions
natal_aspects
transit_events
daily_transits
lunar_events
numerology_profiles
daily_readings
compatibility_reports
subscriptions
notification_preferences
saved_reports

Define indexes and retention rules.

Do not store values that can cheaply and safely be derived unless caching creates meaningful value.

---

## GOAL 3 — ASTRONOMICAL ENGINE

Build deterministic calculations for:

- Sun
- Moon
- Mercury
- Venus
- Mars
- Jupiter
- Saturn
- Uranus
- Neptune
- Pluto

Optional extensibility:

- lunar nodes
- Chiron
- Lilith
- asteroids

Every celestial longitude should support:

0° <= longitude < 360°

Convert longitude to zodiac:

signIndex = floor(longitude / 30)
degreeWithinSign = longitude % 30

Signs:

0 Aries
1 Taurus
2 Gemini
3 Cancer
4 Leo
5 Virgo
6 Libra
7 Scorpio
8 Sagittarius
9 Capricorn
10 Aquarius
11 Pisces

Create rigorous unit tests around:

- 0°
- 29.999°
- 30°
- 359.999°
- wraparound

---

## GOAL 4 — ASPECT ENGINE

Implement minimal angular separation:

diff = abs(a - b) % 360
distance = min(diff, 360 - diff)

Initial aspect set:

Conjunction = 0°
Sextile = 60°
Square = 90°
Trine = 120°
Opposition = 180°

Make orb configuration data-driven.

Example defaults:

Conjunction 8°
Sextile 5°
Square 7°
Trine 7°
Opposition 8°

Do not hardwire interpretation text inside calculation functions.

Return structured objects.

Example:

{
type,
exactAngle,
actualAngle,
orb,
applying,
separating,
normalizedStrength
}

Where technically practical, distinguish applying vs separating aspects.

---

## GOAL 5 — TRANSIT ENGINE

Compare current planetary positions against natal placements.

Generate structured events such as:

Transit Mars square Natal Sun
Transit Venus trine Natal Moon
Transit Jupiter conjunct Natal Midheaven

Store:

- transiting body
- natal target
- aspect
- exact timestamp
- orb
- start window
- peak
- end window
- strength
- categories affected

Build deterministic transit scoring.

Initial conceptual model:

impact =
transitPlanetWeight
× natalTargetWeight
× aspectWeight
× orbStrength

Keep weight tables configurable.

Never pretend this score is scientifically validated.

It is a product interpretation metric.

---

## GOAL 6 — NATAL CHART ENGINE

Given:

- date of birth
- time of birth
- latitude
- longitude
- timezone

calculate:

- Sun sign
- Moon sign
- Ascendant
- Midheaven
- planetary placements
- house cusps
- planets in houses
- natal aspects

Support configurable house systems later.

Store calculation metadata including:

- engine version
- ephemeris version
- timezone resolution
- house system
- calculation timestamp

Make charts reproducible.

---

## GOAL 7 — LUNAR ENGINE

Calculate using solar/lunar longitude rather than an approximate calendar whenever possible.

phaseAngle =
(moonLongitude - sunLongitude) mod 360

Classify:

0° New Moon
45° Waxing Crescent
90° First Quarter
135° Waxing Gibbous
180° Full Moon
225° Waning Gibbous
270° Third Quarter
315° Waning Crescent

Calculate:

- phase
- illumination
- Moon age
- Moon zodiac sign
- next New Moon
- next Full Moon
- Moon aspects
- lunar transit relevance

With location support, optionally expose:

- moonrise
- moonset
- altitude
- azimuth

Test phase boundaries carefully.

---

## GOAL 8 — PERSONAL LUNAR ENGINE

Compare current Moon to natal placements.

Return:

- natal target
- aspect
- orb
- strength
- duration
- exact time
- interpretation identifiers

Generate a Lunar Influence score as a product heuristic.

The underlying celestial calculation must remain separate from heuristic interpretation.

---

## GOAL 9 — NUMEROLOGY ENGINE

Implement Pythagorean numerology initially.

Mapping:

1 A J S
2 B K T
3 C L U
4 D M V
5 E N W
6 F O X
7 G P Y
8 H Q Z
9 I R

Implement:

- Life Path
- Expression / Destiny
- Soul Urge / Heart's Desire
- Personality
- Birthday Number
- Maturity Number
- Personal Year
- Personal Month
- Personal Day

Support configurable handling for master numbers:

11
22
33

Do not assume every numerology tradition uses identical reduction rules.

Design:

NumerologyStrategy interface

Potential implementations:

PythagoreanNumerology
ChaldeanNumerology — future

Name normalization must account for:

- whitespace
- hyphens
- punctuation
- diacritics
- Unicode
- optional handling of Y

Document all normalization rules.

---

## GOAL 10 — COMBINED PERSONAL CONTEXT ENGINE

Combine:

Natal Chart +
Current Transits +
Moon Conditions +
Personal Lunar Transits +
Numerology Cycles

Output structured domain data.

Example categories:

love
career
finance
energy
communication
personalGrowth
friction
opportunity

The engine must output data before prose.

Example:

{
"scores": {
"career": 84,
"love": 61,
"energy": 72,
"communication": 91
},
"strongestEvents": [],
"moon": {},
"numerology": {},
"explanationKeys": []
}

---

## GOAL 11 — INTERPRETATION ENGINE

Implement deterministic interpretation templates first.

Structure interpretation data around keys.

Example:

mars.square.sun
venus.trine.moon
personal-year.8

Separate:

FACT:
"Mars is square the natal Sun at an orb of 1.2°."

INTERPRETATION:
"Within astrology, this aspect is commonly interpreted as..."

AI should consume structured JSON.

AI MUST NOT calculate astronomical values itself.

Add schema validation around AI input/output.

Prevent unsupported claims.

Clearly frame astrology/numerology as interpretive or entertainment/personal-reflection content where appropriate.

---

## GOAL 12 — DAILY HOROSCOPE ENGINE

Build two modes.

### Public Sun-Sign Mode

For users without birth data:

12 zodiac signs
×
current transits
×
lunar state
×
interpretation rules

Generate:

daily
weekly
monthly

### Personalized Mode

Use natal data and current transits.

Personalized reports should explain why a reading exists.

Show:

- source transit
- orb
- strength
- Moon context
- numerology context

Avoid opaque random prose.

---

## GOAL 13 — DASHBOARD UX

Design a premium visual dashboard.

Primary widgets:

TODAY
Overall score

MOON
Phase
sign
illumination
next major phase

TRANSITS
Strongest active aspects

CATEGORY SCORES
Love
Career
Money
Energy
Communication
Growth

NUMEROLOGY
Personal Year
Month
Day

TIMELINE
Upcoming important events

Use accessible visualization.

Do not communicate meaning solely through color.

Responsive priority:

1. mobile
2. tablet
3. desktop

Support PWA capability where practical.

---

## GOAL 14 — NATAL CHART VISUALIZATION

Build an interactive SVG wheel.

Include:

- signs
- houses
- planets
- aspects
- ASC
- DSC
- MC
- IC

Hover/tap planets to expose:

- body
- sign
- degree
- house
- aspects

Separate geometry/layout code from calculation code.

---

## GOAL 15 — ASTROLOGY TIMELINE

Create a high-retention event calendar.

Examples:

Moon changes sign
New Moon
Full Moon
Mercury station
retrogrades
major transits
personal exact aspects
numerology cycle boundaries

Every event may contain:

start
peak
end
strength
category
explanation
notification option

---

## GOAL 16 — COMPATIBILITY

Build relationship comparison.

Phase 1:

- zodiac comparison
- numerology compatibility

Phase 2:

- synastry aspects
- house overlays
- weighted relationship categories

Potential displayed categories:

Attraction
Communication
Emotional
Long-Term
Chemistry

Compatibility scores must be clearly described as product-defined interpretive metrics.

Build shareable privacy-safe URLs.

Do NOT expose either person's raw private birth information in a public URL.

---

## GOAL 17 — SEO ARCHITECTURE

Create useful public pages.

Potential structure:

/horoscope/[sign]/today
/horoscope/[sign]/weekly
/horoscope/[sign]/monthly

/moon-phase/today
/moon-phase/[date]

/full-moon/[year]
/new-moon/[year]

/numerology/life-path/[number]

/astrology/[aspect-or-placement]

Implement:

- canonical URLs
- XML sitemap
- robots directives
- metadata
- structured data where valid
- internal links
- breadcrumbs
- semantic headings
- useful unique copy

Do NOT mass-produce thin AI pages.

---

## GOAL 18 — AUTHENTICATION AND USER PROFILE

Secure account system.

Users can manage:

- name
- birth data
- timezone
- current location
- preferences
- notification settings
- saved profiles

Require explicit privacy handling for personal data.

Allow profile deletion.

---

## GOAL 19 — SUBSCRIPTIONS

Design feature gating.

FREE

- Sun-sign daily horoscope
- current Moon
- basic zodiac profile
- Life Path
- basic numerology

PERSONAL

- natal chart
- personalized daily reading
- transits
- lunar-to-natal analysis
- numerology cycles
- forecast
- alerts

ADVANCED

- full transit calendar
- synastry
- advanced reports
- annual forecasting
- multiple profiles
- downloadable reports
- advanced AI explanations

Do not hard-code final prices until market validation.

Implement plans through configuration.

---

## GOAL 20 — NOTIFICATION ENGINE

Potential channels:

- web push
- email
- in-app

Examples:

Full Moon approaching
exact personal transit
Personal Month changes
important upcoming aspect
daily briefing

Implement:

- opt-in
- unsubscribe
- timezone-aware delivery
- idempotency
- frequency controls

Avoid notification spam.

---

## GOAL 21 — CACHING AND PERFORMANCE

Natal charts:
calculate once unless inputs or engine version change.

Global planetary positions:
shared cache.

Global Moon information:
shared cache.

Personal transit comparison:
incremental/cacheable.

Public horoscope pages:
cache/revalidate intelligently.

Measure performance rather than guessing.

---

## GOAL 22 — SECURITY

Threat model at minimum:

- auth bypass
- privilege escalation
- insecure direct object reference
- injection
- XSS
- CSRF where relevant
- malicious user content
- API abuse
- subscription bypass
- webhook forgery
- exposed secrets
- account enumeration
- rate-limit abuse
- public compatibility URL leakage

Use server-side authorization.

Never trust client plan state.

Validate webhook signatures.

Implement database row-level security where appropriate.

---

## GOAL 23 — PRIVACY

Birth date, birth time, location and relationship profiles are user data.

Implement:

- least-data collection
- deletion
- export strategy
- privacy-safe logs
- no secrets in telemetry
- no unnecessary third-party sharing

Clearly separate public and private profile data.

---

## GOAL 24 — TESTING

Create unit tests for every deterministic engine.

ASTROLOGY:

- zodiac boundaries
- angular wraparound
- aspects
- orbs
- transit scoring

MOON:

- phase boundaries
- known astronomical fixture dates where reliable reference fixtures are available

NUMEROLOGY:

- normalization
- master numbers
- known examples
- Unicode edge cases

AUTH:

- authorization boundaries

BILLING:

- webhook idempotency
- plan transitions

UI:

- critical workflows

E2E:

- account registration
- create birth profile
- generate natal chart
- view daily reading
- subscription boundary
- compatibility flow

---

# VERIFICATION LOOP

After every major goal:

1. lint
2. typecheck
3. unit tests
4. integration tests if relevant
5. build
6. inspect runtime
7. inspect browser/UI if capability exists
8. fix issues
9. rerun verification
10. update docs/PROJECT_STATUS.md

Do not declare completion merely because files exist.

---

# CODE REVIEW

At significant milestones perform a review using the current Codex review capability where appropriate.

/review

Review specifically for:

- incorrect calculations
- time-zone bugs
- longitude wrapping bugs
- floating-point boundary issues
- duplicated logic
- hidden coupling
- security issues
- accessibility
- performance
- missing tests
- misleading astrology/science claims

Fix substantive findings.

---

# GIT WORKFLOW

Use small logical commits.

Suggested prefixes:

feat:
fix:
test:
docs:
refactor:
chore:
perf:
security:

Never commit broken builds intentionally.

Do not overwrite unrelated user work.

Never reset or delete changes you do not understand.

---

# TOKEN / CONTEXT OPTIMIZATION

Do not repeatedly reread the entire repository.

Use targeted discovery.

Keep:

AGENTS.md
concise and persistent.

Use:

docs/PROJECT_STATUS.md
for project state.

Use:

docs/ARCHITECTURE.md
for architecture.

Use Skills for repeatable procedures.

Use subagents for independent bounded tasks.

Search before opening large files.

Prefer references over copying huge documents into context.

Update documentation when architectural decisions change.

---

# DEFINITION OF DONE

A feature is NOT complete because code was generated.

A feature is complete when:

- implementation exists
- types pass
- lint passes
- tests pass
- build passes
- edge cases have been checked
- security implications have been reviewed
- accessibility has been checked where applicable
- documentation is updated
- no secrets are committed
- calculations can be reproduced
- user-facing behavior works

---

# START NOW

Perform repository discovery first.

Then:

1. inspect /status
2. inspect /skills
3. inspect /mcp
4. inspect repository
5. inspect existing AGENTS.md
6. run /init only if AGENTS.md is missing
7. identify useful skills/plugins/connectors
8. establish architecture
9. create/update PROJECT_STATUS.md
10. begin Goal 1

Do not jump directly into visual implementation before establishing the deterministic domain engines and architecture.

Continue systematically until the next legitimate external blocker.
