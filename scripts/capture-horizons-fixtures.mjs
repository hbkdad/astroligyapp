import { readFile, writeFile } from "node:fs/promises";

const API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
const MANIFEST_PATH = new URL(
  "../tests/fixtures/ephemeris/reference-cases.json",
  import.meta.url,
);
const OUTPUT_PATH = new URL(
  "../tests/fixtures/ephemeris/reference-values.json",
  import.meta.url,
);
const TARGETS = {
  sun: "10",
  moon: "301",
  mercury: "199",
  venus: "299",
  mars: "499",
  jupiter: "599",
  saturn: "699",
  uranus: "799",
  neptune: "899",
  pluto: "999",
};

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const retrievedAt = new Date().toISOString();
const cases = [];

for (const fixture of manifest.cases) {
  const bodies = {};
  for (const [body, targetId] of Object.entries(TARGETS)) {
    const parameters = buildParameters(fixture, targetId);
    const url = `${API_URL}?${new URLSearchParams(parameters)}`;
    const response = await fetch(url, {
      headers: { "user-agent": "astroligyapp-fixture-capture/1.0" },
    });
    if (!response.ok) {
      throw new Error(`Horizons ${response.status} for ${fixture.id}/${body}`);
    }
    const payload = await response.json();
    const rows = extractRows(payload.result);
    if (rows.length !== 2) {
      throw new Error(`Expected two Horizons rows for ${fixture.id}/${body}`);
    }
    const current = parseRow(rows[0]);
    const next = parseRow(rows[1]);
    bodies[body] = {
      targetId,
      requestUrl: url,
      rawRows: rows,
      expected: {
        eclipticLongitudeDegrees: current.longitude,
        eclipticLatitudeDegrees: current.latitude,
        distanceAu: current.distanceAu,
        speedLongitudeDegreesPerDay:
          signedCircularDifference(current.longitude, next.longitude) * 1440,
      },
    };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  cases.push({ id: fixture.id, instant: fixture.instant, bodies });
}

await writeFile(
  OUTPUT_PATH,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: {
        name: "JPL Horizons API",
        apiVersion: "1.3 (2025 June)",
        documentation: "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
        retrievedAt,
        quantities: [
          "20 apparent range and range-rate",
          "31 observer ecliptic longitude and latitude",
        ],
        timeScale: "UT",
        coordinateDefinition: "observer-centered IAU76/80 ecliptic-of-date",
      },
      cases,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

function buildParameters(fixture, targetId) {
  const start = fixture.instant.replace("T", " ").replace("Z", "");
  const stop = new Date(Date.parse(fixture.instant) + 60_000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
  const observer = fixture.observer;
  return {
    format: "json",
    COMMAND: `'${targetId}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@399'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${observer.longitudeDegrees},${observer.latitudeDegrees},${observer.elevationMeters / 1000}'`,
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: "'1m'",
    QUANTITIES: "'20,31'",
    TIME_TYPE: "'UT'",
    CAL_FORMAT: "'CAL'",
    CSV_FORMAT: "'YES'",
  };
}

function extractRows(result) {
  const start = result.indexOf("$$SOE");
  const end = result.indexOf("$$EOE");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Horizons response did not contain an ephemeris block");
  }
  return result
    .slice(start + 5, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseRow(row) {
  const fields = row.split(",").map((field) => field.trim());
  if (fields.length < 7) throw new Error(`Unexpected Horizons row: ${row}`);
  const [distanceAu, longitude, latitude] = [
    fields[3],
    fields[5],
    fields[6],
  ].map(Number);
  if (![distanceAu, longitude, latitude].every(Number.isFinite)) {
    throw new Error(`Non-numeric Horizons row: ${row}`);
  }
  return { distanceAu, longitude, latitude };
}

function signedCircularDifference(from, to) {
  return ((to - from + 540) % 360) - 180;
}
