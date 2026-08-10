# MASTER BUILD SPECIFICATION

# PERSONAL ASTROLOGY + LUNAR + NUMEROLOGY INTELLIGENCE PLATFORM

## MISSION

Design and develop a production-grade SaaS platform that calculates astronomical conditions, astrological chart information, lunar cycles and numerological values and transforms those deterministic results into understandable personalized interpretations, timelines, reports and notifications.

This must not be a generic horoscope text generator.

The central product architecture is:

USER DATA
↓
DETERMINISTIC CALCULATION ENGINES
↓
NORMALIZED PERSONAL CONTEXT
↓
RULE-BASED INTERPRETATION
↓
OPTIONAL AI NATURAL-LANGUAGE LAYER
↓
DASHBOARD / REPORT / TIMELINE / NOTIFICATION

---

# CORE DESIGN PRINCIPLE

There are three fundamentally different types of information in this product.

## LAYER A — ASTRONOMICAL FACT

Examples:

Moon longitude
Sun longitude
planetary position
Moon phase
Moon illumination
planetary angular separation
rise/set times

These must be computed using reliable astronomical data.

## LAYER B — ASTROLOGY / NUMEROLOGY INTERPRETATION

Examples:

"Venus trine Jupiter is interpreted as..."

"Life Path 8 is traditionally associated with..."

These are interpretive traditions.

They must not be presented as scientifically proven predictions.

## LAYER C — AI LANGUAGE GENERATION

AI converts verified structured results into readable personalized language.

AI DOES NOT generate Layer A.

AI should not modify deterministic results.

---

# PRODUCT POSITIONING

Primary concept:

PERSONAL COSMIC CALENDAR

Combines:

Astrology
Lunar cycles
Numerology
Personal timing
Relationship compatibility
Daily guidance
Long-range timelines
Notifications
AI explanation

---

# USER DATA

Required for advanced personalization:

Name
Birth date

Optional but important:

Exact birth time
Birth city
Birth coordinates
Current location
Current timezone

Optional preferences:

Career focus
Relationship focus
Financial focus
Personal-growth focus
Notification preferences
Astrology system preferences
House system
Numerology system

Do not infer sensitive information unnecessarily.

---

# ASTRONOMY ENGINE

Use a validated ephemeris implementation.

Preferred candidate:

Swiss Ephemeris

Before commercial production:

VERIFY ITS CURRENT LICENSING REQUIREMENTS.

Do not assume commercial licensing conditions.

Abstract ephemeris access through an interface so another backend can replace it.

Example:

interface EphemerisProvider {
getPlanetPosition(...)
getMoonPosition(...)
getSunPosition(...)
getHouseCusps(...)
}

Never spread provider-specific code throughout the application.

---

# CELESTIAL OBJECTS

Initial:

Sun
Moon
Mercury
Venus
Mars
Jupiter
Saturn
Uranus
Neptune
Pluto

Extensible:

North Node
South Node
Chiron
Lilith
Ceres
Pallas
Juno
Vesta

---

# ZODIAC ENGINE

Longitude:

0–360°

Divide zodiac into 12 × 30° signs.

0–29.999 Aries
30–59.999 Taurus
60–89.999 Gemini
90–119.999 Cancer
120–149.999 Leo
150–179.999 Virgo
180–209.999 Libra
210–239.999 Scorpio
240–269.999 Sagittarius
270–299.999 Capricorn
300–329.999 Aquarius
330–359.999 Pisces

Return:

{
sign,
degree,
minute,
second,
absoluteLongitude
}

---

# ASPECT ENGINE

Minimum angular distance:

D = abs(A - B) % 360
distance = min(D, 360 - D)

Initial major aspects:

Conjunction 0°
Sextile 60°
Square 90°
Trine 120°
Opposition 180°

Optional later:

Semisextile 30°
Semisquare 45°
Quintile 72°
Sesquiquadrate 135°
Quincunx 150°

Orb system must be configurable.

Initial example:

Conjunction 8°
Sextile 5°
Square 7°
Trine 7°
Opposition 8°

Allow future rules based upon:

planet
luminary
aspect
natal/transit context

---

# ASPECT STRENGTH

Example normalized formula:

orbStrength =
max(0, 1 - actualOrb / maximumOrb)

Weighted impact may use:

impact =
transitingPlanetWeight
× natalTargetWeight
× aspectWeight
× orbStrength

Weights are product heuristics.

Store weight configuration independently.

Do not call heuristic scores scientific measurements.

---

# TRANSIT ENGINE

Compare:

CURRENT SKY
against
NATAL CHART

Produce:

transiting body
natal target
aspect
orb
exact time
applying/separating
start
peak
end
strength
relevant interpretation IDs

Examples:

Transit Mars square Natal Sun
Transit Venus trine Natal Moon
Transit Jupiter conjunct Natal MC

---

# NATAL CHART ENGINE

Input:

birth date
birth time
latitude
longitude
timezone

Output:

Sun
Moon
Ascendant
Midheaven
planets
houses
house cusps
planet-house placements
aspects
angles

Persist calculation metadata.

Never lose:

timezone
coordinate source
ephemeris version
house system
calculation version

---

# HOUSE SYSTEM

Architecture must support pluggable house systems.

Possible systems:

Placidus
Whole Sign
Equal House

Choose one default only after product decision.

Do not lock database representation to one system.

---

# LUNAR ENGINE

Use actual Sun/Moon positional data whenever possible.

phaseAngle =
(moonLongitude - sunLongitude + 360) % 360

Primary phases:

New Moon
Waxing Crescent
First Quarter
Waxing Gibbous
Full Moon
Waning Gibbous
Third Quarter
Waning Crescent

Calculate:

phase angle
phase name
illumination
Moon sign
Moon degree
Moon age
next New Moon
next Full Moon

Optional location features:

moonrise
moonset
altitude
azimuth
culmination

---

# PERSONAL LUNAR INTELLIGENCE

Compare Moon to natal:

Sun
Moon
Mercury
Venus
Mars
Jupiter
Saturn
angles

Generate:

personal lunar aspects
orb
exact time
relevance
duration
category influence

Potential UI:

LUNAR INFLUENCE
91 / 100

The score is a product heuristic.

---

# NUMEROLOGY ENGINE

Primary initial tradition:

Pythagorean numerology.

LETTER VALUES

1:
A J S

2:
B K T

3:
C L U

4:
D M V

5:
E N W

6:
F O X

7:
G P Y

8:
H Q Z

9:
I R

Build strategy-based architecture.

interface NumerologySystem {
calculateLifePath()
calculateExpression()
calculateSoulUrge()
calculatePersonality()
calculatePersonalYear()
...
}

Future:

Chaldean
other systems

---

# LIFE PATH

Implement a documented component-reduction approach.

Support configurable preservation of:

11
22
33

Every numerology result should include calculation trace.

Example:

{
value: 8,
masterNumber: false,
trace: [...]
}

Users should be able to see how a number was produced.

---

# EXPRESSION NUMBER

Use normalized full birth name.

All characters must go through consistent normalization.

Handle:

accents
Unicode
apostrophes
spaces
hyphens

Never silently drop unknown Unicode characters without explicit rules.

---

# SOUL URGE

Calculate from vowels.

Y handling must be configurable.

---

# PERSONALITY NUMBER

Calculate from consonants.

---

# NUMEROLOGY PROFILE

Potential values:

Life Path
Expression
Soul Urge
Personality
Birthday
Maturity
Personal Year
Personal Month
Personal Day

Future possible systems:

Pinnacles
Challenges
Cycles
Karmic Debt
Balance
Hidden Passion

Implement only after calculation methodology is documented.

---

# COMBINED CONTEXT ENGINE

Normalize everything into a single structured daily context.

Example:

{
date,
location,
natal: {},
sky: {},
moon: {},
transits: [],
numerology: {},
categories: {},
strongestSignals: []
}

This object becomes the authoritative input to downstream interpretation.

---

# CATEGORY ENGINE

Potential categories:

Love
Career
Finance
Energy
Communication
Creativity
Relationships
Personal Growth
Friction
Opportunity

Scores:

0–100

But also retain:

confidence
source events
contributing factors

Never expose a number without being able to explain how it was derived.

---

# INTERPRETATION LIBRARY

Create structured interpretation content.

Example:

interpretations/
planets/
aspects/
houses/
signs/
transits/
numerology/
lunar/

Keys:

mars.square.sun
venus.trine.jupiter
moon.capricorn
personal-year.8

Separate interpretation content from executable calculation logic.

---

# AI INTERPRETATION

AI receives only validated structured context.

Example input:

{
transit: {
planet: "Mercury",
aspect: "trine",
natalTarget: "Jupiter",
orb: 0.8
},
moon: {...},
numerology: {...}
}

Instruction:

Explain the calculated information.

Do NOT create additional astronomical facts.

AI output should be schema validated.

Potential fields:

headline
summary
opportunity
caution
reflection
categoryNotes

Provide deterministic fallback copy if AI fails.

The product must function without AI.

---

# PUBLIC HOROSCOPE ENGINE

Generate 12 sign forecasts based on current sky conditions.

Signs:

Aries
Taurus
Gemini
Cancer
Leo
Virgo
Libra
Scorpio
Sagittarius
Capricorn
Aquarius
Pisces

Periods:

Daily
Weekly
Monthly

Do not merely ask an LLM to invent a horoscope.

Calculate the sky first.

---

# PERSONALIZED DAILY REPORT

Example UI:

YOUR DAY

Overall
82 / 100

Moon
Waxing Gibbous
Capricorn
84% illumination

Career
91

Relationships
73

Finance
62

Communication
94

Strongest Transit
Mercury trine natal Jupiter
Orb 0.8°

Numerology
Personal Year 8
Personal Month 7
Personal Day 3

The user should always be able to inspect the underlying signal.

---

# TIMELINE ENGINE

Create personal time-based event feed.

Examples:

Moon sign changes
Full Moon
New Moon
planet changes sign
retrograde station
direct station
personal aspect enters orb
personal aspect exact
personal aspect exits orb
numerology Personal Month transition

Potential timeline display:

DATE
EVENT
STRENGTH
CATEGORY
DURATION

---

# NOTIFICATIONS

Examples:

"Your strongest transit this month becomes exact tomorrow."

"Full Moon occurs tonight."

"Your Personal Month changes Monday."

"Venus enters a 1° trine with your natal Moon."

Channels:

In-app
Email
Web push

Make delivery:

timezone-aware
idempotent
rate-limited
preference-driven

---

# COMPATIBILITY ENGINE

Level 1:

Sun signs
Moon signs
numerology

Level 2:

synastry

Compare two natal charts.

Major aspects:

Sun–Sun
Sun–Moon
Moon–Moon
Venus–Mars
Mercury–Mercury
Saturn-related aspects
ASC interactions

Categories:

Attraction
Emotional
Communication
Chemistry
Long-Term

Create transparent scoring.

Do not claim scientific relationship prediction.

---

# SHAREABLE COMPATIBILITY

Generate random opaque share token.

Never include raw birth date/time/location in public route.

Example:

/match/7FB2KQ

Allow report deletion.

Set public/private state explicitly.

---

# FREE PRODUCT

Potential features:

Daily Sun-sign horoscope
Current Moon phase
Current Moon sign
Basic zodiac profile
Life Path calculator
Basic numerology
Public lunar calendar

---

# PERSONAL SUBSCRIPTION

Potential:

Natal chart
Personal daily reading
Personal transits
Moon-to-natal analysis
Daily numerology
30-day calendar
notifications
basic compatibility

---

# ADVANCED SUBSCRIPTION

Potential:

advanced transit calendar
full synastry
multiple profiles
annual outlook
advanced reports
downloads
AI Q&A
advanced timing tools

Pricing must remain configurable until validated.

---

# USER RETENTION LOOP

Daily:

Daily reading
Moon update
Personal Day number

Weekly:

weekly forecast
coming transit summary

Monthly:

monthly astrology report
Personal Month change
Moon calendar

Event based:

Full Moon
New Moon
exact transit
retrograde
major personal aspect

---

# DATABASE

Potential entities:

users

profiles

birth_profiles

birth_charts

planet_positions

house_cusps

natal_aspects

transit_events

lunar_events

numerology_profiles

numerology_cycles

daily_contexts

daily_readings

compatibility_reports

subscriptions

notification_preferences

notification_deliveries

content_interpretations

audit_events

Design normalized schema first.

Add materialized/cache tables only when justified.

---

# CACHING

Natal calculations:

cache indefinitely against versioned inputs.

Cache key should consider:

birth data
house system
ephemeris engine version
calculation version

Global sky:

cache by timestamp resolution.

Moon:

cache globally for shared data.

Personal reports:

cache by user/date/calculation version.

---

# WEB APPLICATION

Preferred baseline:

Next.js
TypeScript
React
Tailwind CSS
accessible component primitives

Database:

PostgreSQL

Deployment:

platform-agnostic first

Keep code portable.

---

# DESIGN DIRECTION

Visual goal:

premium
celestial
modern
immersive
readable

Avoid cheap fortune-teller clichés.

Avoid overwhelming stars/glitter.

Think:

high-end astronomical dashboard +
premium editorial astrology product

Use subtle:

orbital geometry
constellations
lunar imagery
gradient depth
chart lines
celestial motion

Animation must respect:

prefers-reduced-motion

---

# PRIMARY NAVIGATION

Today

Moon

My Chart

Timeline

Numerology

Compatibility

Explore

---

# TODAY PAGE

Sections:

Daily overview
category scores
strongest transit
Moon
numerology
timeline preview
personal interpretation
upcoming event

---

# MOON PAGE

Current phase
Moon sign
illumination
Moon age
next phases
calendar
personal lunar transits
moonrise/moonset when available

---

# MY CHART

Interactive wheel

Placements

Houses

Aspects

Interpretations

Raw chart data

---

# TIMELINE

Day
Week
Month
Year

Filters:

Moon
Personal transit
Planetary
Numerology
Relationship

---

# NUMEROLOGY

Profile

Life Path

Expression

Soul Urge

Personality

Personal Year

Personal Month

Personal Day

Calculation explanations

---

# COMPATIBILITY

Create partner profile

Compare

View categories

Inspect aspects

Share

---

# SEO STRATEGY

Useful indexable pages:

/horoscope/aries/today
/horoscope/taurus/today
...

/horoscope/[sign]/weekly
/horoscope/[sign]/monthly

/moon-phase/today
/moon-phase/[date]

/full-moon/[year]
/new-moon/[year]

/numerology/life-path/1
...
/numerology/life-path/9
/numerology/life-path/11
/numerology/life-path/22
/numerology/life-path/33

/astrology/[placement]
/astrology/[aspect]

Every page must provide genuine standalone value.

No automated thin-content spam.

---

# STRUCTURED DATA

Where valid implement schema.org markup such as:

BreadcrumbList
Article
FAQPage only when content genuinely qualifies

Do not misuse schema markup.

---

# ACCESSIBILITY

Target WCAG 2.2 AA practices.

Keyboard navigation.

Semantic HTML.

Visible focus states.

Sufficient contrast.

Screen-reader labels.

Charts require text equivalents.

Do not encode chart meaning only by color.

---

# PERFORMANCE

Targets should be measured.

Optimize:

Core Web Vitals
bundle size
image delivery
SVG complexity
database queries
server response
cache hit rate

Lazy-load expensive visualizations.

---

# SECURITY

Apply:

secure cookies
CSRF protections where applicable
server-side authorization
input validation
output encoding
rate limiting
secure headers
webhook verification
least privilege
database constraints

Never trust user plan information from browser state.

---

# PRIVACY

Birth information can be personal.

Implement:

export
delete
privacy controls
retention rules
safe logging

Avoid exposing:

birth location
exact birth time
private profile names

in analytics or public routes.

---

# PAYMENT ARCHITECTURE

Use provider abstraction where practical.

Primary likely provider:

Stripe

But keep core feature-entitlement model independent.

Store:

providerCustomerId
providerSubscriptionId
plan
subscriptionStatus
currentPeriodEnd

Server determines entitlements.

---

# ENTITLEMENTS

Feature flags should be centrally defined.

Example:

FREE:
basic_horoscope
moon_phase
life_path

PERSONAL:
natal_chart
personal_transits
notifications

ADVANCED:
synastry
multiple_profiles
advanced_reports

Do not sprinkle plan-name comparisons throughout UI components.

---

# OBSERVABILITY

Structured logs.

Error tracking.

Performance monitoring.

Calculation failures.

Webhook failures.

Notification failures.

Do not log secrets or unnecessary private birth data.

---

# TEST STRATEGY

UNIT

Astrology calculations
aspect detection
longitude conversion
numerology
Moon classification
score calculations

INTEGRATION

ephemeris adapter
database
authentication
subscription state

E2E

signup
birth profile
chart
daily report
upgrade
compatibility
notifications preferences

VISUAL

responsive layouts
chart wheel
dashboard
dark/light modes if supported

---

# CALCULATION FIXTURES

Create a fixture dataset.

For each fixture record:

inputs
provider version
expected values
allowed tolerance

Use reliable reference values where available.

Do not modify tests just to make broken calculations pass.

---

# VERSIONING

Version:

astrology engine
numerology engine
interpretation library
score model

Example:

astroEngineVersion
numerologyVersion
interpretationVersion
scoreModelVersion

This makes old reports reproducible.

---

# PROJECT DOCUMENTATION

Maintain:

README.md

AGENTS.md

docs/
ARCHITECTURE.md
DATA_MODEL.md
ASTROLOGY_ENGINE.md
NUMEROLOGY_ENGINE.md
LUNAR_ENGINE.md
INTERPRETATION_ENGINE.md
SECURITY.md
PRIVACY.md
SEO.md
DEPLOYMENT.md
TESTING.md
PROJECT_STATUS.md

---

# CODEX INTEGRATION

Use Codex's supported workflow rather than treating the model as a one-shot code generator.

At project initialization:

/status
/skills
/mcp

If required:

/init

Inspect and use appropriate available skills.

Use `$skill-name` explicit invocation when deterministic workflow control helps.

Inspect MCP servers before assuming integrations are available.

Use subagents for isolated parallel tasks when available.

Use repository AGENTS.md for durable instructions.

Use docs/PROJECT_STATUS.md for ongoing execution state.

Use `/review` or equivalent supported review workflow at major milestones.

---

# REQUIRED AGENTS.MD PRINCIPLES

AGENTS.md must instruct Codex to:

- preserve unrelated user changes
- inspect before modifying
- use strict TypeScript
- avoid `any` except justified edge cases
- test deterministic algorithms
- validate external data
- never fabricate astronomy data
- never commit secrets
- run lint/typecheck/tests/build
- update project status
- verify UI after substantial visual changes
- keep calculation and interpretation layers separate

---

# PROJECT-SPECIFIC SKILLS

Create only where they improve repeatability.

Suggested:

astro-validation
numerology-validation
security-audit
seo-audit
release-check
ui-quality
database-migration

Each SKILL.md must state:

trigger
scope
procedure
validation
anti-patterns

---

# RELEASE CHECK

Before any production release:

clean git state understood

environment variables documented

database migrations tested

lint passes

typecheck passes

unit tests pass

integration tests pass

E2E critical path passes

production build passes

security review complete

privacy controls working

subscriptions verified

webhooks verified

SEO metadata checked

robots checked

sitemap checked

accessibility checked

responsive checked

calculation fixtures verified

error tracking configured

rollback strategy understood

---

# PRODUCT ETHICS / CLAIMS

Never present astrology or numerology as scientifically established prediction.

It is acceptable to say:

"Astrology traditionally interprets..."

"Within this system..."

"This reading is based on..."

Avoid:

"This will definitely happen."

"You should make a medical decision because..."

"You should invest because..."

"Your relationship will fail."

High-stakes health, financial, legal and safety decisions must not be presented as determined by astrology/numerology.

---

# LONG-TERM EXPANSION

Architecture may eventually support:

solar returns
progressions
secondary progressions
annual profections
electional astrology
relocation astrology
astrocartography
advanced synastry
composite charts
additional numerology traditions
mobile apps
widgets
calendar synchronization
Apple/Google calendar exports
AI conversational chart analyst
voice readings
gift reports
professional astrologer accounts
white-label accounts
API access

Do not prematurely build all of these.

Preserve architectural extensibility.

---

# DEVELOPMENT ORDER

Build in this order:

PHASE 1
Infrastructure
architecture
database
auth
project standards

PHASE 2
Ephemeris abstraction
zodiac calculations
aspect engine
Moon engine
numerology engine

PHASE 3
Natal charts
transits
personal context
calculation tests

PHASE 4
Dashboard
Moon page
numerology page
chart visualization
timeline

PHASE 5
Interpretation library
daily reading
public horoscopes

PHASE 6
Compatibility

PHASE 7
Subscriptions
entitlements
notifications

PHASE 8
SEO/public content

PHASE 9
security
performance
accessibility
QA

PHASE 10
deployment
production verification

Do not reverse this sequence merely to produce visually impressive screenshots early.

The deterministic foundation is the product.

---

# COMPLETION PRINCIPLE

The objective is not:

"generate a horoscope website."

The objective is:

Build a reliable computational platform that happens to provide horoscope, astrology, lunar and numerology experiences.

Every important displayed result must be:

traceable
reproducible
explainable
testable

Every AI-produced interpretation must have deterministic source data behind it.

Every premium feature must provide a clear reason for users to return.

Every engineering decision should favor:

correctness
maintainability
privacy
performance
automation
low operating cost
commercial extensibility

Proceed systematically.
